---
sidebar_position: 2
---

# Auth Module — API Reference

## How to read this document

This is the **target/spec design** for the auth module's HTTP surface — it documents what the
API should look like once the [Gap](./overview.md#gap-between-current-code-and-target-design)
in the overview is closed, not the current generic-boilerplate code in `src/auth/`. It assumes
you've read [Auth Module — Overview](./overview.md) for the data model, request pipeline, and
flow narratives; this document does not repeat those, it turns them into concrete request/response
contracts.

This document is intentionally HTTP-contract-level only — no controller/decorator code. When
implementing a route below, it lives under `src/api/auth/` (or `src/api/platform-admin/` for
the [platform admin API](#platform-admin-api)) per `apps/backend/docs/conventions/module-structure.md`:
the request/response JSON shown here is what that route's Swagger decorator (in that controller's
`swagger/` file) should render as its example, and each success/error `message` string comes from
`src/common/constants/messages.constants.ts`, not an inline literal.

Every route below (password, Microsoft SSO, Google social auth, invites, all three) is part of
the **backend's** target surface regardless of MVP scope — this document does not encode which
buttons the frontend renders. For this engagement only the Microsoft routes are actually exercised
by the shipped UI; see the overview's [Frontend / backend
boundary](./overview.md#frontend--backend-boundary) for that distinction. Don't drop or gate a
non-Microsoft route here just because MVP doesn't call it today.

One file, seven sections: [Conventions](#conventions), [Configuration](#configuration), [Data
model quick reference](#data-model-quick-reference), the [tenant user](#tenant-user-api) and
[platform admin](#platform-admin-api) endpoint tables, a consolidated [error
reference](#error-reference), and [security considerations](#security-considerations).

## Conventions

- **Base path**: every route in this document is versioned — `/v1/auth/...` for tenant users,
  `/v1/platform-admin/auth/...` for platform admins (`RouteNames.AUTH` /
  `RouteNames.PLATFORM_ADMIN_AUTH`, `version: '1'`). `RouteNames.AUTH` exists today;
  `RouteNames.PLATFORM_ADMIN_AUTH` is net-new — `src/common/route-names.ts` has no
  platform-admin slug yet.
- **Auth column**: `Public` — no bearer token needed (`@Public()`, skips `JwtAuthGuard`). `Bearer`
  — needs `Authorization: Bearer <access_token>`, or the equivalent `sid` / `admin_sid` cookie
  (`CookieAuthMiddleware` promotes it automatically, see the overview's [request
  pipeline](./overview.md#global-request-pipeline)).
- **Success envelope** — every 2xx response is wrapped by `TransformInterceptor`
  (`src/interceptors/transform.interceptor.ts`). The `data` shapes shown below are the *inner*
  payload; the actual HTTP body is:

  ```json
  {
    "statusCode": 200,
    "status": "Success",
    "message": "Request successful",
    "data": { }
  }
  ```

- **Error envelope** — every non-2xx response, uniformly, from `HttpExceptionFilter` +
  `ErrorHandlerService` (`src/common/filters/`, `src/common/services/error-handler.service.ts`):

  ```json
  {
    "statusCode": 401,
    "status": "Failure",
    "message": "Invalid email or password",
    "error": "Unauthorized",
    "traceId": "3f9c2b7a-...",
    "data": null
  }
  ```

  `message` is human-readable and safe to show a user for the 4xx cases documented below.
  `traceId` is a fresh UUID per request — ask for it when filing a bug, it keys the matching
  server log line. Field-validation failures (`class-validator` on a DTO) collapse into a single
  `message` string, comma-joined, `error: "Validation Error"` — see [Error
  reference](#error-reference).
- **Redirect responses** — every OAuth entry route (`GET .../microsoft`, `GET .../google`, their
  `/signup` variants, and the `GET .../invite/:token/microsoft` \| `/google` invite-acceptance
  variants — six per surface, three intents × two providers) is a `302` redirect to the identity
  provider's consent screen, not JSON. The **callback** routes are also `302` — on success, to the
  frontend app with the token pair attached (see [Token delivery on OAuth
  callback](#token-delivery-on-oauth-callback)); on failure, to a frontend error page with a
  `?error=` code from the [error reference](#error-reference).
- **Idempotent-looking failures are intentional** — [`POST
  /v1/auth/forgot-password`](#post-v1authforgot-password) returns `200` regardless of whether the
  target email exists, specifically to avoid leaking account existence. This is narrower than it
  might look: the token-*lookup*/preview routes (`GET .../invite/:token`) are not idempotent this
  way — they correctly `400` on an invalid token — only the *initiating* password-reset request
  masks existence. See [Security considerations](#security-considerations).

## Configuration

Environment variables read by this module (`src/config/env.config.ts`). Only `JWT_SECRET`,
`JWT_REFRESH_SECRET` and the `GOOGLE_*` trio exist there today (alongside unrelated `GITHUB_*`
vars) — **every other row in this table is net-new**, not just the Microsoft ones, per the
[Gap](./overview.md#gap-between-current-code-and-target-design).

| Variable | Required | Purpose |
|---|---|---|
| `JWT_SECRET` | Yes | Signs access tokens. |
| `JWT_REFRESH_SECRET` | **Yes in production**; falls back to `JWT_SECRET` only when `NODE_ENV !== 'production'` | Signs refresh tokens, so an access-token leak can't be replayed as a refresh token. That protection is worth nothing if the two secrets are the same, so the fallback is a local-dev convenience only: `env.config.ts` must **refuse to boot** in production when this is unset *or* equal to `JWT_SECRET` — a startup check, not a README warning. |
| `JWT_ACCESS_EXPIRY` | No, default `15m` | Access token TTL. Currently hardcoded to 15 minutes in `auth.module.ts`; promote to an env var so staging/local can lengthen it. |
| `JWT_REFRESH_EXPIRY` | No, default `7d` | Refresh token TTL. Currently hardcoded to 7 days (`604800` seconds) in `token.service.ts`; promote to an env var alongside `JWT_ACCESS_EXPIRY`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | Only if Google social auth is enabled for any tenant | Existing — Google OAuth app credentials. See the overview's [Supported login methods](./overview.md#supported-login-methods) for why this is "social auth," not "SSO," by default. |
| `MICROSOFT_CLIENT_ID` | Yes (this engagement) | Entra ID app registration client ID. |
| `MICROSOFT_CLIENT_SECRET` | Yes (this engagement) | Entra ID app registration client secret. |
| `MICROSOFT_CALLBACK_URL` | Yes (this engagement) | Must exactly match the redirect URI registered on the Entra app. |
| `MICROSOFT_TENANT_ID` | No, default `common` | Restricts which Entra directories can complete the OAuth handshake at the provider level. `common` accepts any organizational or personal Microsoft account — use a specific directory ID here only if *every* InnoPeak tenant should be restricted to one Entra org, which is not this engagement's case. Per-tenant directory restriction is instead enforced in application code via `tenant_identity_providers.provider_tenant_id` — see [`GET /v1/auth/microsoft/callback`](#get-v1authmicrosoftcallback). |
| `FRONTEND_URL` | Yes | Base URL the OAuth callback routes redirect back to with the token pair (or error code) appended. |
| `INVITE_TOKEN_TTL_HOURS` | No, default `72` | Expiry window written to `user_auth_tokens.expires_at` / `platform_admin_auth_tokens.expires_at` for `purpose = 'invite'`. |
| `RESET_TOKEN_TTL_HOURS` | No, default `1` | Same, for `purpose = 'reset'`. |
| `VERIFY_EMAIL_OTP_TTL_MINUTES` | No, default `10` | Expiry window for the 6-digit signup/login verification OTP (tenant users only — platform admins have no email-verification step, see [Data model quick reference](#data-model-quick-reference)). In **minutes**, not hours — this is a short numeric code, not a long-lived link. |
| `OAUTH_STATE_TTL_MINUTES` | No, default `10` | How long a signed OAuth `state` payload (see [`GET /v1/auth/microsoft/callback`](#get-v1authmicrosoftcallback)) is accepted after issuance — bounds how long an abandoned OAuth redirect can be resumed. |
| _(not an env var)_ `REFRESH_REUSE_GRACE_SECONDS` | Compile-time constant, `10` | In `auth.constants.ts`, not the environment. Window inside which presenting an already-rotated refresh token counts as a lost rotation race (benign, session preserved) rather than reuse of a leaked token — see [`POST /v1/auth/refresh`](#post-v1authrefresh). |
| _(not an env var)_ `LOGIN_LOCKOUT_THRESHOLD` | Compile-time constant, `10` | In `auth.constants.ts`, not the environment. Consecutive failed password logins for one email (see [Email normalization](#email-normalization)) before that email is locked out — see [Brute-force protection](#brute-force-protection-throttling-and-per-account-lockout). |
| _(not an env var)_ `LOGIN_LOCKOUT_WINDOW_SECONDS` | Compile-time constant, `900` (15 minutes) | In `auth.constants.ts`, not the environment. How long the failure counter lives, and how long the lockout lasts once tripped. |

**`refresh_tokens` table**: `0002_tenant_auth.sql` (`id`, `user_id`, `token_hash`, `expires_at`,
`revoked_at`, `created_at`) — supports the "basic rotation" scope described under
[`POST /v1/auth/refresh`](#post-v1authrefresh): single-use rotation, revoke-on-logout,
revoke-all-on-disabled/suspended. **Tenant users only** — no `platform_admin_id` column, since
platform-admin login doesn't exist in this codebase yet. Not yet present: a self-referencing
`replaced_by_token_id`, which the fuller reuse-grace-window replay behavior would need (to know
"the pair this already-rotated token was replaced by" rather than just that it's revoked) — a
follow-up migration alongside that feature, not assumed here.

**Housekeeping**: neither `refresh_tokens` nor `user_auth_tokens` is ever read for a
revoked/used or expired row again (`findActiveRefreshToken` and `consumeVerifyEmailToken` both
exclude them), so without a purge both tables only grow — one `refresh_tokens` row per session ever
started. The worker's `CronJobName.AUTH_TOKEN_CLEANUP` job (`CronScheduler`, daily at 03:00 — off
the midnight slot the existing daily job uses) calls `AuthDbService.purgeStaleTokens`, which deletes
`verify_email` codes that are used or expired and refresh tokens that are revoked or expired, and
logs both counts. The worker process imports `DBModule` for exactly this.

## Data model quick reference

Full column-level detail lives in `0001_platform_admin.sql` and `0002_tenant_auth.sql`, and every enum type quoted below is declared in `0000_foundation.sql`; this is a fast lookup while reading the
endpoint tables below. See the overview's [Data model](./overview.md#data-model) section for the
narrative version and the two enums to keep straight (`user_identity_provider` vs.
`review_provider`).

**`tenants`** — `id`, `name`, `created_by_platform_admin_id` (nullable), `status`
(`tenant_status`: `pending_activation` \| `active` \| `suspended`), `created_at`, `updated_at`.

**`tenant_identity_providers`** — `id`, `tenant_id`, `provider` (`tenant_identity_provider`:
`entra_id` \| `google_workspace`), `provider_tenant_id`, `is_active`, `created_at`, `updated_at`.
Unique on `(provider, provider_tenant_id)`.

**`users`** — `id`, `tenant_id`, `name`, `email`, `password_hash` (nullable), `email_verified_at`
(nullable), `invited_by_user_id` (nullable, self-referencing — the inviting owner's `users.id`;
NULL for a self-registered owner or a platform-admin-provisioned one, see [`POST
/v1/auth/invite`](#post-v1authinvite)), `role` (`user_role`: `owner` \| `member`), `status`
(`user_status`: `pending_verification` \| `invited` \| `active` \| `disabled`), `anonymized_at`
(nullable, GDPR — see `PLAN.md` §6.2, staff erasure), `created_at`, `updated_at`. Unique
on `(tenant_id, email)` — the same email can belong to different tenants as different rows.

**`tenant_settings`** — `id`, `tenant_id` (unique — one row per tenant),
`escalation_rating_threshold` (1–5), `auto_post_enabled`, `review_data_retention_months`,
`created_at`, `updated_at`. Created alongside the owner during signup (see [`POST
/v1/auth/signup`](#post-v1authsignup)) — not part of auth's own domain, but the signup transaction
is the one place auth code writes to it.

**`user_identities`** — `id`, `user_id`, `provider` (`user_identity_provider`: `entra_id` \|
`google`), `provider_user_id`, `email` (the email the IdP reported at link time — may differ from
`users.email` if changed later at the provider), `created_at`, `updated_at`. Unique on `(provider,
provider_user_id)` — one external account can only ever back one app user, across all tenants.

**`user_auth_tokens`** — `id`, `user_id`, `token_hash` (never store the raw token — see
[Security considerations](#security-considerations)), `purpose` (`token_purpose`: `verify_email` \|
`invite` \| `reset`), `expires_at`, `used_at` (nullable, single-use), `created_at`, `updated_at`.

**`platform_admins`** — `id`, `email`, `password_hash` (nullable), `invited_by_platform_admin_id`
(nullable — null only for the single seeded root admin, enforced by the partial unique index
`idx_platform_admins_single_root`), `status` (`platform_admin_status`: `invited` \| `active` \|
`disabled`), `created_at`, `updated_at`. **No `role` column** — platform admins are a flat
hierarchy, differentiated only by invite lineage, not by permission level.

**`platform_admin_identities`** — `id`, `platform_admin_id`, `provider`
(`user_identity_provider`, the same enum the tenant-user side uses), `provider_user_id`,
`created_at`, `updated_at`. Near-mirror of `user_identities`, with one consequential difference:
**there is no `email` column**, so the platform-admin SSO invite branch below has nowhere to
persist the email the IdP reported at link time. Adding it is a required follow-up migration if
that value needs to be retained.

**`platform_admin_auth_tokens`** — mirrors `user_auth_tokens`, but `purpose` is
`platform_admin_invite_purpose` (`invite` \| `reset` — no `verify_email`, since a platform admin
is always invited by another admin and never self-registers).

### Email normalization

Three things in this module hinge on two email strings being *equal*: the `(tenant_id, email)`
uniqueness on `users` (and `idx_platform_admins_email`), the `409 EMAIL_ALREADY_MEMBER` check on
[`POST /v1/auth/invite`](#post-v1authinvite), and — the one with a security consequence — the
`INVITE_EMAIL_MISMATCH` comparison in the OAuth callback's `invite` branch. Both email columns are
plain `VARCHAR(255)` with case-sensitive unique indexes (`0002_tenant_auth.sql`,
`0001_platform_admin.sql`), so without a rule here `Jane@Corp.com` and `jane@corp.com` are two
different users to the database, a duplicate invite sails past the `409`, and a legitimate invitee
whose IdP reports a differently-cased address fails the mismatch check.

The rule: **every email is normalized on ingress, in code, before it is stored, looked up, or
compared** — `trim()` then lowercase the entire address. (RFC 5321 technically allows a
case-sensitive local part; no mail provider this product will ever meet honours that, and treating
it as significant only creates the failure modes above.) This applies to every email this module
touches, in both directions:

- Request bodies and query params: `SignupDto.email`, `LoginDto.email`, `ForgotPasswordDto.email`,
  `InviteDto.email`, and the platform-admin equivalents — normalize in a `class-transformer`
  `@Transform`, so validation and the service both see the canonical form.
- IdP-reported emails: the `email`/`preferred_username` claim from Microsoft and the `email` claim
  from Google are normalized before being written to `user_identities.email`, before the `signup`
  branch inserts `users.email`, and before the `invite` branch compares against the invited
  `users.email` / `platform_admins.email`.
- Stored values are therefore always canonical; a query never needs a `lower()` on its side.

**Recommended follow-up migration, not required for this to work**: a unique index on
`(tenant_id, lower(email))` — the same shape `idx_blocklist_terms_tenant_id_lower_term` already
uses — as a database-level backstop for any future write path that bypasses the DTO layer (a seed
script, a support tool). Until then the code-level rule is the only enforcement, which is why it's
stated as a hard requirement here and not a style preference.

## Tenant user API

### Registration & session

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/auth/signup` | Public | 5 / min |
| `GET` | `/v1/auth/microsoft/signup` | Public | 30 / min |
| `POST` | `/v1/auth/login` | Public | 10 / min |
| `GET` | `/v1/auth/microsoft` | Public | 30 / min |
| `GET` | `/v1/auth/microsoft/callback` | Public | 30 / min |
| `GET` | `/v1/auth/google/signup` + `/v1/auth/google` + `/v1/auth/google/callback` | Public | 30 / min |
| `POST` | `/v1/auth/sso/complete-signup` | Public | 5 / min |
| `POST` | `/v1/auth/refresh` | Public | 20 / min |
| `POST` | `/v1/auth/logout` | Bearer | 30 / min |
| `GET` | `/v1/auth/me` | Bearer | 30 / min |

> **What is implemented today (tenant Microsoft sign-in/sign-up).** The Microsoft routes below are
> the original target design; what shipped is narrower and differs in places. Authoritative contract:
> [Microsoft sign-in](./microsoft-login-design.md). In short:
>
> - Entry is `GET /v1/auth/microsoft?intent=login|signup` (no `/microsoft/signup`, no `businessName`
>   in the query); a new person is sent to `/onboarding/business-name` and finishes with
>   `POST /v1/auth/sso/complete-signup { businessName }`, which reads the `sso_pending_signup`
>   cookie (shared with Google; replaces `google/complete-signup` and `google_pending_signup`).
> - The callback is `GET /v1/auth/microsoft/callback`, tenant `login`/`signup` only; tokens are set as
>   httpOnly cookies, never in the redirect URL. Failures are `${FRONTEND_URL}/login|onboarding/signup?error=<code>`
>   with `INVALID_STATE`, `ACCESS_DENIED`, `PROVIDER_ERROR`, `EMAIL_NOT_VERIFIED`, `NO_ACCOUNT`,
>   `ACCOUNT_UNAVAILABLE`, `NOT_CONFIGURED`. Google and Microsoft callback failures also carry
>   `&provider=google|microsoft`, so the web can show that provider's own wording for the same code
>   (for example, Microsoft's `EMAIL_NOT_VERIFIED` tells the user to ask their admin to set the
>   account's email).
> - Identity is the ID token's `sub` (`user_identities`, provider `entra_id`). The email is trusted only
>   when the token carries `xms_edov` (and an `email` claim); otherwise `EMAIL_NOT_VERIFIED`. There is no per-tenant directory
>   check yet.
> - Config: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_CALLBACK_URL`, optional
>   `MICROSOFT_AUTHORITY`.
> - Both routes honour `platform_settings.microsoft_login_enabled`: while it is off they answer
>   `?error=NOT_CONFIGURED&provider=microsoft` instead of signing anyone in. The Azure app needs the `email` and `xms_edov` optional ID-token claims.
>
> **Platform-admin sign-in (sign-in only).** `GET /v1/admin/auth/microsoft` (public, 10 / min) starts an
> `admin_login` round trip pinned to the directory in `ADMIN_MICROSOFT_TENANT_ID`; the same callback
> finishes it and, on success, sets the admin session cookies and redirects to `/admin`. It signs in only an
> existing **active** platform admin (matched by `(entra_id, sub)`, else linked by verified email on first
> use); no admin is ever created or invited through it. Failures go to
> `/admin-login?error=<code>&provider=microsoft` (`NO_ACCOUNT` for an unknown/invited address or another
> directory, `ACCOUNT_UNAVAILABLE` for a disabled admin, `EMAIL_NOT_VERIFIED`, `NOT_CONFIGURED`). It ignores
> `microsoft_login_enabled` (a tenant-facing switch); availability is
> `adminMicrosoftLoginAvailable` on `GET /v1/settings/platform-config`.

Every OAuth entry route below — signup, login, and (further down)
[invite-accept](#get-v1authinvitetokenmicrosoft) — funnels into **one** callback per provider,
`GET /v1/auth/microsoft/callback` / `GET /v1/auth/google/callback`, rather than each having its
own callback URL. What the callback does depends entirely on an `intent` (`signup` \| `login` \|
`invite`) signed into the `state` parameter by whichever entry route started the redirect — see
that route's own section below. An earlier draft of this document gave signup and login separate
callback URLs; that fell apart the moment invite-acceptance needed OAuth too, since it's neither
signup nor a plain login. One callback, dispatching on signed `state`, is the pattern every entry
point uses consistently instead.

#### Platform switches

The platform admin's sign-in switches are enforced here, not only by hiding buttons:

| Switch | What the server refuses while it is off | What it never touches |
|---|---|---|
| `microsoftLoginEnabled` | Microsoft authorize and callback (`NOT_CONFIGURED`) | Anything else |
| `googleLoginEnabled` | Tenant Google authorize and callback for login, sign-up and invites (`NOT_CONFIGURED`), including a callback already in flight | Platform-admin Google sign-in and admin invites |
| `passwordLoginEnabled` | Every way of getting a session from an email and a password: sign-up (403 `PASSWORD_SIGNUP_DISABLED`), and sign-in, `verify-email`, `resend-verification-otp` and accepting a member invitation with a password (403 `PASSWORD_LOGIN_DISABLED`). Checked first, before the attempt budget or any account lookup | Sessions that already exist (refresh keeps working), password change and set for a signed-in user, restoring an account, and platform-admin sign-in, which never consults it |

A missing settings row reads as on, like the column default. Beyond refusing the routes, these rules keep the switches from stranding anyone:

- A pending single-sign-on sign-up (the business-name step, up to 15 minutes after the callback) is re-checked against its provider's switch when it completes, since that step is what creates the tenant (`POST /v1/auth/sso/complete-signup` answers 403 `SSO_SIGNUP_DISABLED`).
- `PATCH /v1/admin/settings/platform-config` refuses with 400 `SSO_LOGIN_DISALLOWED_SSO_ONLY_USERS` to turn Microsoft or Google off while active tenant users could then only sign in with it (no password, no other provider), because there is no way to give such a user a password. Unlike the platform-admin guard it can be overridden: repeating the request with `confirmLockout: true` (the admin console asks for confirmation first) switches the provider off and locks those users out until it is switched back on. The override exists because switching a provider off is also the emergency lever when it is compromised or down, and that must work however many people use it. The flag is never stored, and the override is logged as a warning with the number of users affected.
- It also refuses, with 400 `PLATFORM_SETTINGS_NO_USABLE_METHOD`, a change that would leave no sign-up method both enabled and set up on the server (Microsoft and Google also need credentials; email/password also needs a working email service).
- **Switching email/password on needs an email service.** `PATCH /v1/admin/settings/platform-config` answers 422 `PASSWORD_LOGIN_NEEDS_EMAIL_SERVICE` for `passwordLoginEnabled: true` while the server cannot deliver email: `EMAIL_DELIVERY_ENABLED` is not `true`, or the provider is not configured (no `EMAIL_FROM`, or for SES no credentials and not the AWS deployment target, or for SMTP no `SMTP_HOST`). There is no developer-machine exemption: the local provider only logs the message. `false` is always accepted.
- **Switching the password off has no stranded-user confirmation.** Unlike Microsoft and Google, businesses whose only way in is a password cannot sign in while it is off, and `PATCH` does not warn about them or ask for `confirmLockout`. While no email service is configured the switch is not in effect for anyone, so switching the stored value off strands nobody new.
- The web Settings screen keeps the Profile tab (password change or set) whatever the password switch says, since the server leaves that unaffected.

#### `POST /v1/auth/signup`

Owner self-registration, password path. Corresponds to the password branch of `PLAN.md` §4.3a.
Creates the tenant, owner, and default settings together in one transaction, then emails a 6-digit
verification **code** (not a link — see [`POST /v1/auth/verify-email`](#post-v1authverify-email)
for why). Fails outright, with **no tenant created**, if this email is already registered anywhere
— any status, any tenant: `findUserByEmail` is a global lookup, deliberately not scoped to
`tenant_id` the way `users`' own composite uniqueness constraint is. That lookup is only the
cheap fast path, though — the actual guarantee is the partial unique index
`idx_users_email_active ON users(email) WHERE anonymized_at IS NULL`: two simultaneous signups
for one email both pass the pre-check, and then exactly one `INSERT` commits; the loser's `23505`
rolls back its tenant + settings and is reported as the same `409` (a check-then-insert alone was
observed to create 4 tenants from 5 concurrent signups). Partial so an anonymized account frees
its email for reuse. This supersedes the older
resumable-signup design (`PLAN.md` §8.10/§8.18): the recovery path for someone who never finished
verifying is now [`POST /v1/auth/login`](#post-v1authlogin), which resends a fresh code for a
still-`pending_verification` account instead of signup silently resuming it.

Request:

```json
{
  "businessName": "The Coffee House",
  "ownerName": "Jane Doe",
  "email": "jane@thecoffeehouse.com",
  "password": "StrongP@ss1"
}
```

| Field | Type | Rules |
|---|---|---|
| `businessName` | string | **required**, 1–255 chars **after trimming** (whitespace-only is rejected) → `tenants.name`. This is the tenant/company identity — a genuinely different thing from `locations.name` (the per-location name synced later from a connected Google Business Profile). One tenant can have several `locations` rows (a business with multiple branches), so the tenant name can't be *derived from* a location connection; it's collected directly from the owner here. |
| `ownerName` | string | required, 1–255 chars after trimming → `users.name`. |
| `email` | string | required, valid email format |
| `password` | string | required, 8–128 chars and at most 72 UTF-8 bytes (bcrypt ignores everything past byte 72, so a longer new password is refused rather than silently truncated), at least one upper, one lower, one digit, and one special character — where "special" is **any non-alphanumeric, non-whitespace character** (`#`, `-`, `_`, `~`, … all count; the pattern is not an allowlist). Spaces are allowed inside a passphrase; line breaks are not. `PASSWORD_PATTERN` in `auth.constants.ts`; the frontend's live checklist (`checkPasswordRequirements`) mirrors it rule-for-rule. |

Success `201`:

```json
{
  "tenantId": "0190f3b2-...",
  "userId": "0190f3b2-...",
  "status": "pending_verification",
  "message": "Verification code sent to jane@thecoffeehouse.com"
}
```

The response also sets an httpOnly `signup_binding` cookie (path `/v1/auth`, 24 h; `Secure` over https). It ties the unverified account to the
browser that proved the password, and [`POST /v1/auth/verify-email`](#post-v1authverify-email) refuses an unverified account without it (the
same error as a wrong code). `POST /v1/auth/login` on a still-unverified account sets it too, which is how a second device finishes a sign-up.

Errors: `400` validation, `409 EMAIL_ALREADY_REGISTERED` (an account already exists at this email, under any status or tenant). An *unverified* sign-up older than 24 hours does not count: it is replaced by the new one.

#### `GET /v1/auth/microsoft/signup`

Starts the SSO signup flow. Query params `businessName` and `ownerName` are signed into the OAuth
`state` parameter alongside `intent: 'signup'` — never trust `state` without verifying its
signature in the callback, see [Security considerations](#security-considerations). Redirects
(`302`) to Microsoft's consent screen.

| Query param | Required | Notes |
|---|---|---|
| `businessName` | **Yes**, 1–255 chars | Signed into `state`. Names `tenants.name` — the tenant/company identity, collected directly from the owner same as the password path. Distinct from `locations.name` (the per-location name synced later from a connected Google Business Profile); a tenant can have several locations, so this can't be derived from that connection. |
| `ownerName` | No | Falls back to the name the IdP reports for the authenticated account — SSO already asserts identity, so this one genuinely can be optional. |

The callback's `signup` branch reads `businessName` back out of `state` and uses it as-is for
`tenants.name`; only `ownerName`'s absence needs a fallback (the IdP-reported name).

`GET /v1/auth/google/signup` is the same shape, `provider = 'google'`.

#### `POST /v1/auth/login`

Password login. Credentials are checked **before** branching on account status — a
`pending_verification` account is only ever revealed to a caller who already proved they know the
password, never to anyone who merely knows the email exists.

Request:

```json
{ "email": "jane@thecoffeehouse.com", "password": "StrongP@ss1" }
```

Success `200`, one of two shapes:

- **Active account** — an access token in the body, exactly like [`POST /v1/auth/verify-email`](#post-v1authverify-email)'s success response, **plus** both tokens set as httpOnly cookies (`Secure` in production): `refresh_token` scoped to `/v1/auth`, `access_token` scoped to `/` — neither ever appears in a JSON body a script running on the page could read or exfiltrate. The access token's JSON copy exists purely so the frontend can keep its own record in `localStorage` (an httpOnly cookie's value is invisible to its own JS):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900,
  "user": {
    "id": "0190f3b2-...",
    "tenantId": "0190f3aa-...",
    "name": "Jane Doe",
    "email": "jane@thecoffeehouse.com",
    "role": "owner"
  },
  "hasConnectedBusiness": false
}
```

  `hasConnectedBusiness` is derived from whether a `review_provider_connections` row exists for
  this tenant (no dedicated flag exists) — it's what the frontend uses to route to the "connect
  your Google Business Profile" stepper instead of the dashboard.

- **Still `pending_verification`** — not an error. A fresh OTP is sent and the frontend renders
  the same OTP stepper the signup wizard uses:

```json
{
  "status": "pending_verification",
  "email": "jane@thecoffeehouse.com",
  "message": "Verification code sent to jane@thecoffeehouse.com"
}
```

Errors: `401 INVALID_CREDENTIALS` (wrong password, unknown email, or user has no `password_hash` —
i.e. an SSO-only account trying the password form; the message is intentionally the same generic
text for all three, see [Security considerations](#security-considerations)), `403
ACCOUNT_DISABLED` (`status = 'disabled'`), `403 TENANT_SUSPENDED` (`tenants.status = 'suspended'`).

#### `GET /v1/auth/microsoft`

Login-only entry. `state` carries `intent: 'login'` and nothing else — no business/invite context
to pass through. `302` to Microsoft. `GET /v1/auth/google` mirrors this, `provider = 'google'`.

#### `GET /v1/auth/microsoft/callback`

The single Microsoft callback for every entry route above it. Verifies `state`'s signature and
`OAUTH_STATE_TTL_MINUTES` freshness first, unconditionally — an invalid or expired `state` is a
`302` to `${FRONTEND_URL}/login?error=INVALID_STATE` regardless of intent. Then branches on
`state.intent`.

**One rule shared by every branch — the directory check.** Whenever a branch is about to issue
tokens for a user of an *existing* tenant (the `login` branch, the `signup` branch's returning-user
case, and the `invite` branch), and that tenant has an active `tenant_identity_providers` row for
this provider, the IdP token's directory (`tid` claim for Entra; `hd` claim for Google Workspace)
must equal that row's `provider_tenant_id`, or the callback fails with `?error=DIRECTORY_MISMATCH`
and writes nothing. It is stated once here, rather than per branch, because it is a property of the
*tenant*, not of the intent: a tenant that has opted into "our Entra directory only" has opted in for
every way of getting a session, and a check that only ran on `login` would be a formality anyone
could walk around by taking the invite route instead. This is the one place `MICROSOFT_TENANT_ID=common`
is deliberately loosened at the provider level and tightened back up in application code per tenant,
per the overview's [Frontend/backend boundary](./overview.md#frontend--backend-boundary). It does
**not** run for a brand-new signup — the tenant being created has no `tenant_identity_providers` row
yet, so there is nothing to check against. (`PLAN.md` §4.3b says the member-invite path doesn't check
directories; that was written when §2 had parked `tenant_identity_providers` entirely. The moment the
overview extended the check to login, leaving invites out stopped being a simplification and became a
bypass — this document supersedes §4.3b on that one point.)

- **`login`** — looks up `user_identities WHERE provider = 'entra_id' AND provider_user_id = <sub
  claim>`. If found, run the directory check above, then confirm `users.status = 'active'` and
  `tenants.status != 'suspended'` (the same `ACCOUNT_DISABLED` / `TENANT_SUSPENDED` outcomes as
  [`POST /v1/auth/login`](#post-v1authlogin), delivered as `?error=` codes) before issuing tokens.
  If no matching identity exists at all: `302` to `${FRONTEND_URL}/login?error=NO_ACCOUNT_FOUND` —
  login never silently creates a tenant, only the `signup` intent does that. On success: `302` to
  `${FRONTEND_URL}/dashboard?access_token=...&refresh_token=...`.
- **`signup`** — reads `businessName`/`ownerName` back out of `state`, plus the verified email +
  provider `sub` claim from Microsoft's token. **First looks up `user_identities WHERE
  provider = 'entra_id' AND provider_user_id = <sub claim>`** — unlike the password path,
  this check is not optional: `user_identities` is unique on `(provider, provider_user_id)`
  *globally*, not per-tenant (`PLAN.md` §2, §8.21), so the same Microsoft account can never back
  more than one `users` row anywhere in the system. If a match is found, this is functionally a
  returning user, not a new signup: skip tenant creation entirely and issue tokens for their
  existing account exactly as the `login` branch does — directory check and status checks
  included — `302` to `${FRONTEND_URL}/dashboard?...`. Only when no match exists does it proceed,
  in one transaction (`PLAN.md` §4.3a, SSO branch): `INSERT tenants` (`status = 'active'`),
  `INSERT users` (`role = 'owner'`, `status = 'active'`, `email_verified_at = now()`,
  `password_hash = NULL`), `INSERT tenant_settings` (defaults), `INSERT user_identities`
  (`provider = 'entra_id'`). No email-verification step and no "already registered" *error* — see
  [`POST /v1/auth/signup`](#post-v1authsignup) for why "error" isn't the right response even
  when the account already exists. On success: `302` to
  `${FRONTEND_URL}/onboarding/connect?access_token=...&refresh_token=...`.

  **The lookup-then-insert above has a race the password path doesn't.** Two callbacks for the
  same brand-new Microsoft account (a double-click on "Continue with Microsoft" that opened two
  consent tabs) can both find no identity, and both start the transaction. The password path's
  version of this is accepted-not-fixed (`PLAN.md` §8.18) because there it *degrades gracefully*
  — two tenants for one email is a supported outcome. Here it doesn't: `user_identities` is
  globally unique on `(provider, provider_user_id)`, so the second transaction's final `INSERT`
  fails, the whole transaction rolls back (no orphan tenant — that is what the transaction is
  for), and without handling the user sees a `500` from a flow they did nothing wrong in. The
  handling: catch the unique violation on `idx_user_identities_provider_provider_user_id` specifically,
  then **re-run the identity lookup and fall through to the returning-user case** — the row that
  won the race is now there, and this request signs into it. Any other error still propagates.
  This is the concurrent half of `PLAN.md` §8.21, which only covers the sequential one.
- **`invite`** — see [`GET /v1/auth/invite/:token/microsoft`](#get-v1authinvitetokenmicrosoft) in
  Team / invite below; documented there since it needs the invite token's own validation rules
  alongside it.

`GET /v1/auth/google/callback` mirrors all three branches with `provider = 'google'`.

##### Token delivery on OAuth callback

OAuth callbacks are browser top-level navigations, not `fetch` calls the frontend controls — there
is no response body the SPA can read directly. Two options exist: append tokens to the redirect
URL as above (frontend reads them from `location.search` on mount, then immediately replaces the
URL to avoid leaving tokens in browser history), or have the callback set the `sid`/`refresh_token`
HttpOnly cookies directly and redirect with no query params at all. **This document specifies the
query-param approach**, but note that this is now the odd one out: the password-path endpoints
(`login`, `verify-email`, `refresh`) switched to setting `refresh_token` as an httpOnly cookie —
only `accessToken` travels in their JSON body — precisely for the "no token transiting browser
history/referrer/logs" reason this section already called out. When OAuth is actually implemented,
prefer the cookie approach here too, for the same reason and for consistency with the
already-shipped password path, rather than the reverse.

#### `POST /v1/auth/refresh`

No request body — the refresh token comes from the httpOnly `refresh_token` cookie (set by
`login`/`verify-email`/a prior `refresh`), never from a payload a script could construct or read.
The response sets a fresh `access_token` cookie too, alongside the refresh cookie.

Success `200`: new `{ "accessToken": "...", "expiresIn": 900 }` body, and the `refresh_token`
cookie is replaced with the newly-rotated token — rotation means the old refresh token is revoked
in the same call it's presented, against the `refresh_tokens` table (`id`, `user_id`, `token_hash`,
`expires_at`, `revoked_at`, `created_at`).

**Refresh re-checks the principal's standing, every time.** Validating the refresh token proves
the caller *had* a session; it says nothing about whether they should still have one. Before
issuing the new pair, resolve the token's owner and require `users.status != 'disabled'` and the
owning `tenants.status != 'suspended'`. A failure here is `401 INVALID_REFRESH_TOKEN` (no separate
403 — the token itself is being treated as no-longer-valid), and additionally **revokes every
refresh token that user has** — a disabled user or suspended tenant should not be holding a live
refresh token at all. This is the check that makes the "up to 15 minutes" bound in
[Security considerations](#security-considerations) true: without it a suspended tenant's user
keeps rotating refresh tokens indefinitely and the bound is fiction. It costs one indexed lookup
per refresh (at most one every 15 minutes per session), which is why it belongs here and not on
every access-token-bearing request.

**Rotation is one atomic DB step, and strictly single-use.** `AuthDbService.rotateRefreshToken`
revokes the presented token with a compare-and-swap (`UPDATE … SET revoked_at = now() WHERE id = ?
AND revoked_at IS NULL`, returning the row count) and inserts the replacement's hash in the *same*
transaction — and only if that revoke actually flipped the row. Of N concurrent refreshes with one
cookie, exactly one gets a `200`; the rest get `401 INVALID_REFRESH_TOKEN` and no new
`refresh_tokens` row is written for them (before this, the revoke's result was never checked and 5
concurrent refreshes minted 5 live sessions from one token). The refresh JWT also carries
`type: "refresh"` (see [Session / token model](#session--token-model-1)), checked after signature
verification — so an access token can't be replayed against this route even when
`JWT_REFRESH_SECRET` falls back to `JWT_SECRET` in local dev.

**Reuse of an already-rotated token is detected, and how it is handled depends on age.** The
lookup finds the row even when it is revoked, so "already spent" is distinguishable from "never
existed":

- **Spent within `REFRESH_REUSE_GRACE_SECONDS` (10s)** — a lost rotation race. Two tabs waking
  from the same idle period both refresh; the loser's successor is already in the shared cookie
  jar. Answered `401` as `RefreshTokenSupersededException`, which deliberately **keeps** the
  caller's cookies, and the client retries and succeeds with the successor.
- **Spent longer ago** — treated as reuse of a leaked token. The legitimate holder moved on to the
  successor long ago, so **every refresh token for that user is revoked**: the thief and the victim
  both lose their sessions, and only the victim can sign in again with credentials. Answered `401`
  with cookies cleared.

Two limits remain, both bounded by the schema having no token-family column
(`refresh_tokens` is `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`, `created_at`):
the daily `AUTH_TOKEN_CLEANUP` purge deletes revoked rows, so a replay more than a day late finds
no row and gets the plain "session gone" `401` without the family revoke; and there is **no
absolute session lifetime** — rotation keeps extending the 7-day window indefinitely, and adding a
cap needs a column recording each family's origin.

Errors: `401 INVALID_REFRESH_TOKEN` (missing cookie, expired, revoked, already-rotated-out,
malformed, or the owning user/tenant is no longer in good standing).

#### `POST /v1/auth/logout`

`@Public()`, authority taken from the `refresh_token` cookie rather than a bearer token — the
session most in need of revoking is one whose access token already expired, and a JWT-guarded
logout would `401` before revoking anything, leaving a live 7-day refresh token behind a UI that
says "signed out". Signature and the `type` claim are still required; expiry is deliberately
ignored, since an expired token still proves which user it was minted for. No request body.
Any access token presented with it (the `access_token` or `admin_access_token` cookie, or a Bearer header) is verified and ended as well,
which is the only server-side effect a platform admin's logout can have (they hold no refresh token): a tenant token also revokes that user's
refresh tokens, an admin token writes the Redis "not before" mark, and one that does not verify is ignored. Revokes every refresh token belonging to that user (all sessions/devices) — a single-session logout is intentionally not offered as a separate endpoint
to keep the revocation model simple; see [Security considerations](#security-considerations) if
that changes. Also clears the `refresh_token` cookie for the caller.

Success `200`: `{ "message": "Logged out" }`.

#### `GET /v1/auth/me`

Bearer. Returns the authenticated user's own profile — the frontend's "who am I" call after
receiving a token pair, and on every app reload.

Success `200`:

```json
{
  "id": "0190f3b2-...",
  "tenantId": "0190f3aa-...",
  "name": "Jane Doe",
  "email": "jane@thecoffeehouse.com",
  "role": "owner",
  "status": "active",
  "tenant": { "id": "0190f3aa-...", "name": "The Coffee House", "status": "active" }
}
```

### Password management

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/auth/verify-email` | Public | 10 / min |
| `POST` | `/v1/auth/forgot-password` | Public | 5 / min |
| `POST` | `/v1/auth/reset-password` | Public | 5 / min |
| `POST` | `/v1/auth/change-password` | Bearer | 5 / min |
| `POST` | `/v1/auth/set-password/request-otp` | Bearer | 5 / min |
| `POST` | `/v1/auth/set-password` | Bearer | 5 / min |

#### `POST /v1/auth/verify-email`

Request: `{ "email": "jane@thecoffeehouse.com", "otp": "482913" }` — a 6-digit code, **not a
link**. A link's token could be silently consumed by an email security scanner or link-preview
bot prefetching the URL before the real user ever saw it; a code the user has to read and type by
hand into the frontend's OTP stepper doesn't have that exposure. Looks up
`user_auth_tokens WHERE user_id = <resolved from email> AND token_hash = hash(otp) AND
purpose = 'verify_email' AND used_at IS NULL AND expires_at > now()`; on match, sets
`users.email_verified_at = now()`, `users.status = 'active'`, and the token's `used_at`. Password
path only — SSO signups never create a `verify_email` token, see [Auth
flows](./overview.md#auth-flows) item 5.

Success `200`: **issues a token pair**, same shape as [`POST /v1/auth/login`](#post-v1authlogin)'s
active-account response — `accessToken`/`expiresIn`/`user`/`hasConnectedBusiness` in the JSON
body, `refresh_token` set as an httpOnly cookie. This is safe specifically because reaching this
screen already proved the caller knows the account's password — either they just set one at
signup, or they just typed one at login, in the same client flow that led here.

Errors: `400 INVALID_OR_EXPIRED_OTP` — deliberately the same message whether the code is
malformed, already used, expired, or the account is no longer `pending_verification`, to avoid
distinguishing "this code existed once" from "this code never existed."

#### `POST /v1/auth/forgot-password`

> **Not implemented.** Neither this route nor `/v1/auth/reset-password` exists in
> `AuthController`, and `ForgotPasswordDto` / `ResetPasswordDto` do not exist either. There is
> therefore **no password-recovery path today**: an owner who forgets their password and has no
> Google identity cannot regain access. `TokenPurpose.RESET` is reserved in the DB enum for this,
> and **stays** reserved — the superficially similar
> [`set-password`](#post-v1authset-password) step-up OTP has its own `set_password` purpose
> precisely so this public route and that authenticated one can never redeem each other's codes.
> Whichever commit builds this must also add `reset` to `PURGEABLE_OTP_PURPOSES`, or its spent
> rows will never be cleaned up. The contract below is the intended design, kept as the spec to
> build against.

Request: `{ "email": "jane@thecoffeehouse.com" }` (existing `ForgotPasswordDto`).

Success `200` **always**, regardless of whether the email matches a `users` row:
`{ "message": "If an account exists for this email, a reset link has been sent." }`. If a match
exists, creates a `user_auth_tokens` row (`purpose = 'reset'`) and sends the email; if not,
does nothing but still returns the same response and takes comparable time (see [Security
considerations](#security-considerations) — enumeration prevention).

#### `POST /v1/auth/reset-password`

Request (existing `ResetPasswordDto`): `{ "token": "...", "newPassword": "NewStr0ng@Pass" }`.
Same validation and error shape as [`/v1/auth/verify-email`](#post-v1authverify-email)'s token
lookup, `purpose = 'reset'`. On success, updates `password_hash`, marks the token used, and — since
a successful reset is a strong signal the account may have been compromised — should also revoke
all existing refresh tokens for the user (forces re-login everywhere).

Success `200`: `{ "message": "Password reset. Please log in with your new password." }`.

Errors: `400 INVALID_OR_EXPIRED_TOKEN`, `400` validation (password complexity).

#### `POST /v1/auth/change-password`

Bearer, tenant user only (`type === 'tenant_user'`). Throttle 5 / minute. Backs Settings →
Profile → Update password (`apps/web` `ProfileSettingsSection`, gated behind
`AUTH_METHODS.password`). Not `@Roles('owner')` — any tenant user with a password can change
their own; the Settings screen is owner-only in the product, but the credential belongs to the
caller, not the tenant.

Request (`ChangePasswordDto`):

```json
{
  "currentPassword": "StrongP@ss1",
  "newPassword": "NewStr0ng@Pass"
}
```

| Field | Type | Rules |
|---|---|---|
| `currentPassword` | string | required, 1–128 chars. Complexity is **not** re-checked — an older password that would fail today's policy must still be accepted as proof of identity. |
| `newPassword` | string | required, same rules as [`POST /v1/auth/signup`](#post-v1authsignup)'s `password` (8–128 chars, at most 72 bytes, `PASSWORD_PATTERN`), and different from `currentPassword`: `400 NEW_PASSWORD_SAME_AS_CURRENT` otherwise (checked only after the current password is proven, so it cannot be used to probe it). A no-change "change" would still sign every other device out. |

On success, in one transaction: updates `users.password_hash`, then **revokes every refresh
token for that user** — same as [`POST /v1/auth/reset-password`](#post-v1authreset-password).
The most common reason someone changes a password is that they suspect it leaked, and an
attacker holding a refresh token minted from the old one would otherwise keep their session
straight through the change. The caller's own session is among those revoked, so the response
issues a **fresh token pair** and sets the same httpOnly cookies as
[`POST /v1/auth/login`](#post-v1authlogin) (`refresh_token` scoped to `/v1/auth`, `access_token`
scoped to `/`, plus the `session` hint). The JSON body is the same `TokenResponseDto` as login
— **no `refreshToken` field**; a script on the page must not be able to read it. Envelope
`message` is `Password changed. Other sessions have been signed out.`

Success `200`:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900,
  "user": {
    "id": "0190f3b2-...",
    "tenantId": "0190f3aa-...",
    "name": "Jane Doe",
    "email": "jane@thecoffeehouse.com",
    "role": "owner"
  },
  "hasConnectedBusiness": false
}
```

Errors: `401 INVALID_CURRENT_PASSWORD` (`currentPassword` didn't match), `400 NO_PASSWORD_SET`
(SSO-only user with `password_hash IS NULL` — this endpoint isn't how such a user sets an
initial password; that is [`POST /v1/auth/set-password`](#post-v1authset-password)), `403` when
the bearer is a platform-admin token (this route is tenant-user only), `400` validation, `401`
missing/expired access token.

#### `POST /v1/auth/set-password/request-otp`

Bearer, tenant user only. Throttle 5 / minute. No request body — the account is taken from the
access token. Mails a 6-digit code to that account's own address and stores its sha256 in
`user_auth_tokens` with `purpose = 'set_password'`, upserted on `(user_id, purpose)` so
issuing a new code replaces the live one.

This exists because [`set-password`](#post-v1authset-password) has no current password to demand
as proof. Without a second factor, a **stolen access token alone** would be enough to turn a
15-minute credential into a permanent one on any Google-only account — the exact conversion
`TokenService`'s own doc comment says no route may perform. Requiring a code that only the
mailbox owner can read restores that boundary.

`purpose = 'set_password'` is deliberately **not** `'reset'`, which stays reserved for the
unbuilt public [forgot-password](#post-v1authforgot-password) route: one shared value would make
the two flows overwrite each other's live token on the `(user_id, purpose)` unique index, and
would let a code minted here — behind a bearer token — satisfy a consume from that
*unauthenticated* route, and vice versa.

Response `200` is a uniform acknowledgement whether or not a fresh code actually went out — a
send inside the per-email cooldown (`OTP_RESEND_COOLDOWN_SECONDS`) is skipped silently, and the
previously-issued code remains valid, so the message holds either way:

```json
{ "message": "Verification code sent. Check your email to continue." }
```

Errors: `400 PASSWORD_ALREADY_SET` (the account already has a password — use
[`change-password`](#post-v1authchange-password)), `403` platform-admin token, `401`
missing/expired access token.

#### `POST /v1/auth/set-password`

Bearer, tenant user only. Throttle 5 / minute. Backs Settings → Profile → Add password, shown
instead of the change-password form when `hasPassword` is false.

Request (`SetPasswordDto`):

```json
{
  "newPassword": "NewStr0ng@Pass",
  "otp": "482913"
}
```

| Field | Type | Rules |
|---|---|---|
| `newPassword` | string | required, same rules as [`POST /v1/auth/signup`](#post-v1authsignup)'s `password` (8–128 chars, at most 72 bytes, `PASSWORD_PATTERN`). |
| `otp` | string | required, exactly 6 digits — from [`set-password/request-otp`](#post-v1authset-passwordrequest-otp). |

The per-account OTP attempt budget is spent **before** the code is compared (same shape as
[`verify-email`](#post-v1authverify-email)), so an exhausted account cannot be probed for the
code at all. The code is then consumed compare-and-swap — `used_at IS NULL AND expires_at > now()`
lives in the `WHERE` of the same `UPDATE` that spends it, so two concurrent submissions cannot
both succeed. Only then is the password hashed and written.

On success, identical to [`change-password`](#post-v1authchange-password): one transaction writes
`users.password_hash` and revokes every refresh token for that user, then a fresh pair is issued
so the calling tab stays signed in. Body is the same `TokenResponseDto`; envelope `message` is
`Password set. You can now sign in with a password too.`

Errors: `400 PASSWORD_ALREADY_SET`, `400 INVALID_OR_EXPIRED_OTP` (wrong, already-used, or expired
code — one message for all three, per [Security
considerations](#security-considerations)), `429 TOO_MANY_OTP_ATTEMPTS`, `403` platform-admin
token, `400` validation, `401` missing/expired access token.

### Delete the business (owner self-service)

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/auth/delete-account/request-otp` | Bearer, `@Roles('owner')` | 5 / min |
| `POST` | `/v1/auth/delete-account` | Bearer, `@Roles('owner')` | 5 / min |
| `POST` | `/v1/auth/restore-account` | `@Public()` | 5 / min |

Lets an **owner** schedule their own business's erasure — the same two-phase erasure a platform
admin can request (see [Admin Management § Tenant
erasure](../admin-management/overview.md#tenant-erasure-request-and-cancel-platform-admin-only-not-tenant-self-service)),
now also reachable by the owner. Members cannot: removing a *member* is the owner's separate
`request-removal`.

**`POST /v1/auth/delete-account`** — body `{ businessName, password?, otp? }`. An owner an admin has
disabled gets `403 ACCOUNT_DISABLED` even with a still-live access token.

1. `businessName` must equal the tenant's name exactly (trimmed) — a typed confirmation, not a
   checkbox.
2. **Re-authentication.** An owner who has a password sends `password`; one who signed up with
   Google/Microsoft (no password) sends the `otp` mailed by `request-otp` — the same step-up
   `set-password` uses, under its own `delete_account` token purpose so a code minted for one can
   never satisfy the other. A wrong password is `401 INVALID_CURRENT_PASSWORD`, counts against the
   per-account login lockout, and a wrong code spends the per-account OTP budget.
3. Effects, in order: the tenant is suspended and `erasure_requested_at` / `erasure_requested_by_user_id`
   are set (every user's refresh is refused from now on, and an already-issued access token stops working at once: the tenant is marked in Redis and `JwtStrategy` refuses any token issued before the mark, see [`SessionRevocationService`](./overview.md)); a live subscription is cancelled at period end (or
   immediately when `past_due`); polling stops; the activity log records the request with the
   owner's email as actor; every active owner is emailed (scheduled → reminder → cancelled/erased; see
   [Admin Management § Erasure emails](../admin-management/overview.md)); the caller's session cookies are cleared.
4. Success `200`: `{ scheduledFor, gracePeriodDays, canRestore }` — `canRestore` is `true` when the
   owner has a password (see restore below).

**`POST /v1/auth/delete-account/request-otp`** — mails the step-up code to an owner **without** a
password (`400 PASSWORD_REQUIRED` for one who has one: they confirm with the password instead).
Same generic acknowledgement and per-account cooldown as the other OTP routes.

**`POST /v1/auth/restore-account`** — body `{ email, password }`. Undoes a **self-requested**
erasure inside the grace period: the owner's credentials are checked (with the same lockout), the
erasure is cancelled exactly as an admin's `cancel-erasure` is (including resuming a subscription
the erasure ended), and `200` says they can sign in. Anything else — wrong password, unknown email,
an erasure an admin requested, an already-erased tenant, a non-owner, an SSO-only owner — is the
one generic `401 INVALID_CREDENTIALS`, so the route reveals nothing about who has a pending
erasure. An SSO-only owner has no password to restore with and is told to contact support (an admin
cancels the erasure); a member-initiated erasure does not exist.

**Restore only works before the deadline** (`erasure_requested_at` + the grace period). Past it the
nightly purge may already have deleted the Stripe customer, revoked the Google grant and wiped
reviewer names, and restoring would revive a half-erased business — so the restore is refused (the
same generic `401`) and sign-in falls back to the plain `403 TENANT_SUSPENDED`. A tenant stuck past
its deadline is an operations problem (the platform admins are emailed nightly, see [Purge
alerting](../admin-management/overview.md)), not something an owner can undo.

**Only the requesting owner can restore.** `tenants.erasure_requested_by_user_id` must equal the
owner restoring, so when one of several owners schedules the deletion the others cannot restore it
with their own password — their email says so and points them at the requester or support.

**Sign-in during the grace period.** A password sign-in by an owner whose own erasure is pending no
longer fails with the generic `403 TENANT_SUSPENDED`: the password is already proven, so it answers
`403 ACCOUNT_SCHEDULED_FOR_DELETION` (with the date), which the web turns into a "restore your
business" prompt.

### Team / invite

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/auth/invite` | Bearer, `@Roles('owner')` | 10 / min |
| `GET` | `/v1/auth/invite/:token` | Public | 20 / min |
| `POST` | `/v1/auth/invite/accept` | Public | 10 / min |
| `GET` | `/v1/auth/invite/:token/microsoft` | Public | 30 / min |
| `GET` | `/v1/auth/invite/:token/google` | Public | 30 / min |

The accept screen offers the password form plus Google and Microsoft, gated by
`googleLoginEnabled` and `microsoftLoginEnabled` respectively. The backend enforces both switches on
the invite routes as well as hiding the buttons.

#### `POST /v1/auth/invite`

Owner-only. Request: `{ "email": "member@thecoffeehouse.com" }`. Creates a `users` row
(`role = 'member'`, `status = 'invited'`, no `password_hash`, `invited_by_user_id` set to the
calling owner's own `id` — taken from the authenticated request, never from the request body, so
it can't be spoofed) and a `user_auth_tokens` row (`purpose = 'invite'`), sends the invite
email.

Success `201`: `{ "userId": "...", "email": "member@thecoffeehouse.com", "status": "invited" }`.

Errors: `409 EMAIL_ALREADY_MEMBER` (an active or invited user already exists at this
`(tenant_id, email)`).

#### `GET /v1/auth/invite/:token`

Lets the frontend show "You've been invited to join **The Coffee House**" before asking the
invitee to set a password, without spending the token. Read-only — does not set `used_at`.

Success `200`: `{ "tenantName": "The Coffee House", "email": "member@thecoffeehouse.com", "valid": true }`.

Errors: `400 INVALID_OR_EXPIRED_TOKEN`.

#### `POST /v1/auth/invite/accept`

Password path only. Request: `{ "token": "...", "password": "NewStr0ng@Pass" }`. Validates the
token the same way as [`/v1/auth/verify-email`](#post-v1authverify-email) (`purpose = 'invite'`),
sets `password_hash`, `UPDATE users SET status = 'active', email_verified_at = now()` — clicking a
token emailed to this specific address is proof of ownership regardless of which method finishes
the invite, so this is set here unconditionally, not only on the SSO path below (`PLAN.md` §4.3b)
— and consumes the token via the guarded compare-and-swap `UPDATE user_auth_tokens SET
used_at = now() WHERE id = ? AND used_at IS NULL` (`PLAN.md` §8.7 — closes the double-tab
double-submit race, not just a courtesy check).

Success `200`: same token pair + `user` shape as [`POST
/v1/auth/login`](#post-v1authlogin)'s success response — accepting an invite logs the member in
immediately.

Errors: `400 INVALID_OR_EXPIRED_TOKEN`, `400` validation.

#### `GET /v1/auth/invite/:token/microsoft`

The SSO path for accepting an invite — deliberately **not** the same route as
[`/v1/auth/microsoft`](#get-v1authmicrosoft) login, since a first-time invitee has no
`user_identities` row yet for that generic login callback to find (an earlier draft of this
document tried routing invite-acceptance through the plain login callback; it doesn't work, since
that callback only ever looks up by an identity that doesn't exist yet for a first-time SSO user —
see `PLAN.md` §4.3b).

First validates the token is unexpired and unused — read-only, does not consume it — and checks
the Microsoft client plus `microsoft_login_enabled`, so a dead invite link or a switched-off
provider fails fast on the accept screen. If valid, signs `{ intent: 'invite', inviteToken: token }`
into `state` and redirects (`302`) to Microsoft's consent screen. Completion happens back at
[`GET /v1/auth/microsoft/callback`](#get-v1authmicrosoftcallback)'s `invite` branch:

- Decodes `inviteToken` from `state`, re-validates it's still unexpired/unused, and loads the
  `invited`-status `users` row it belongs to.
- Requires a verified email (`xms_edov` for Microsoft), then **confirms it exactly matches that
  user's `email`** — both sides normalized per [Email normalization](#email-normalization). A
  mismatch redirects back to the accept page with `?error=INVITE_EMAIL_MISMATCH` and leaves the
  token **unconsumed**; this is the check that stops someone other than the invited person from
  accepting the link with their own unrelated Microsoft account.
- Refuses a suspended or erased tenant with `?error=ACCOUNT_UNAVAILABLE` before redemption.
- On a match: inserts a `user_identities` row under `entra_id`, activates the member, consumes the
  token with the same guarded compare-and-swap as the password path above, sets the session
  cookies and redirects to `${FRONTEND_URL}/dashboard`.

`GET /v1/auth/invite/:token/google` is the same shape, `provider = 'google'`.

## Platform admin API

Structurally identical to the tenant user API above, against `platform_admins` /
`platform_admin_identities` / `platform_admin_auth_tokens` instead of `users` /
`user_identities` / `user_auth_tokens` — see [Auth flows](./overview.md#auth-flows) item 6.
Differences called out explicitly; everywhere else, substitute table names and re-read the
matching tenant-user section above.

> **What's actually implemented, as of the platform-admin invite flow:** the invite/accept pair
> below is real, but under `/v1/auth/invite/*` and `/v1/auth/login` — **not** a separate
> `/v1/platform-admin/auth/*` namespace, and **no forgot/reset-password for admins**. The route
> table and the rest of this section below are the original forward design and still describe a
> larger surface than what exists. The actually-shipped shape:
>
> | Method | Path | Auth | Throttle |
> |---|---|---|---|
> | `POST` | `/v1/auth/login` | Public | 10 / min — same route as tenant login, dispatches by email (see `AuthService.login`) |
> | `GET` | `/v1/auth/invite/:token` | Public | 20 / min — preview only, **is** offered (see caveat below) |
> | `POST` | `/v1/auth/invite/accept` | Public | 5 / min — password path |
> | `GET` | `/v1/auth/invite/:token/google` | Public | 10 / min — Google path, own route (not `/v1/auth/google`), since a first-time invitee has no `platform_admin_identities` row for the login callback to find |
> | `GET` | `/v1/auth/invite/:token/microsoft` | Public | 10 / min — Microsoft path, own route for the same reason; pinned to `ADMIN_MICROSOFT_TENANT_ID` |
> | `GET` | `/v1/auth/google/callback` | Public | shared with tenant login/signup — dispatches on a third `OAuthIntent.ADMIN_INVITE`, and `OAuthIntent.ADMIN_LOGIN` (the admin sign-in page's Google button, which resolves `platform_admin_identities` only). On tenant `login`/`signup` it never consults admin identities: the same address may be both an admin and a tenant user |
> | `GET` | `/v1/auth/microsoft/callback` | Public | shared with tenant Microsoft sign-in/sign-up — dispatches on `OAuthIntent.ADMIN_INVITE` and `OAuthIntent.ADMIN_LOGIN`; every admin intent is pinned to the configured Entra directory |
>
> `POST /v1/admin/settings/invites` (bearer, platform-admin-only) is what actually sends the
> invite — see the admin module's own API reference, not this one; `AuthController` only owns
> acceptance. `INVITE_EMAIL_MISMATCH` is real and works exactly as designed below. Full details:
> `apps/documentation/docs/backend/auth/invite-flow-design.md`.

Everything from here down is the original design note this comment corrects in the two places
above (the route table right below, and "`GET .../invite/:token` (preview) is intentionally not
offered" further down) — read it as historical context, not as the current contract.

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/platform-admin/auth/login` | Public | 10 / min |
| `GET` | `/v1/platform-admin/auth/microsoft` + `/callback` | Public | 30 / min |
| `GET` | `/v1/platform-admin/auth/google` + `/callback` | Public | 30 / min |
| `POST` | `/v1/platform-admin/auth/refresh` | Public | 20 / min |
| `POST` | `/v1/platform-admin/auth/logout` | Bearer | 30 / min |
| `GET` | `/v1/platform-admin/auth/me` | Bearer | 30 / min |
| `POST` | `/v1/platform-admin/auth/invite` | Bearer | 10 / min |
| `POST` | `/v1/platform-admin/auth/invite/accept` | Public | 10 / min |
| `GET` | `/v1/platform-admin/auth/invite/:token/microsoft` + `/google` | Public | 30 / min |
| `POST` | `/v1/platform-admin/auth/forgot-password` | Public | 5 / min |
| `POST` | `/v1/platform-admin/auth/reset-password` | Public | 5 / min |

Differences from the tenant-user surface:

- **No `/signup` route, at any provider — only `intent: 'login'` and `intent: 'invite'` exist**
  for platform admins, dispatched through the same single-callback-per-provider pattern as the
  tenant-user API (`GET /v1/platform-admin/auth/microsoft/callback` /
  `.../google/callback`). Platform admins are never self-registered — the first ("root") admin is
  created by a seed script, enforced at the database level by `idx_platform_admins_single_root`
  (which permits *at most* one root, so zero-admins is also a valid state — hence the seed).
  **That seed is `src/db/seeds/seed-platform-admin.ts`** (`pnpm db:seed:admin`), which inserts
  exactly one NULL-inviter row and is idempotent, so a replay is a no-op rather than a unique
  violation. It was the migration `0008_dev_platform_admin.sql` until that was removed for
  committing the root password in plain text. Nothing else writes
  `platform_admins` — no route, no service. The remaining gap is not creation but authentication:
  nothing mints a `platform_admin` JWT (`JwtStrategy` validates one, `TokenService` never issues
  one, and `/v1/auth/login` resolves through `users`), so the seeded root cannot sign in until
  these routes are implemented. Every admin after the root must arrive via
  `POST /v1/platform-admin/auth/invite` from an existing admin.
- **The invite-acceptance mechanics are identical to the tenant-user path** — `GET
  /v1/platform-admin/auth/invite/:token/microsoft` signs `{ intent: 'invite', inviteToken: token
  }` into `state`; the callback's `invite` branch requires the IdP-verified email to match the
  invited `platform_admins.email` exactly (`400 INVITE_EMAIL_MISMATCH` otherwise, token left
  unconsumed) and consumes `platform_admin_auth_tokens.used_at` via the same guarded compare-and-swap
  as `user_auth_tokens` (`PLAN.md` §8.7's fix "applies identically... it's the same mechanic
  one level up").
- **No `/verify-email` route.** `platform_admin_invite_purpose` has no `verify_email` value —
  an invited admin's email is trusted because it came from another already-authenticated admin,
  not self-asserted at signup.
- **JWT payload has no `tenantId` and no `role`** — see [Session / token
  model](#session--token-model-1) below.
- **`GET .../invite/:token` (preview) is intentionally not offered** for platform-admin invites —
  low enough volume, and low enough value, that the accept-page can just attempt the accept and
  surface the same `INVALID_OR_EXPIRED_TOKEN` error inline rather than pre-checking.
- **`PLAN.md` §4.3d (support-assisted tenant creation) has no endpoint here, deliberately.** The
  *acceptance* side of that flow is already fully covered — the platform admin's invite creates an
  ordinary `users` row (`role = 'owner'`, `status = 'invited'`) and a `user_auth_tokens` row
  exactly like a member invite, so [`POST
  /v1/auth/invite/accept`](#post-v1authinviteaccept) and [`GET
  /v1/auth/invite/:token/microsoft`](#get-v1authinvitetokenmicrosoft) work unmodified. What's
  *not* documented here is the **initiating** action — a platform admin creating the `tenants`
  row and sending that invite in the first place — because that's tenant provisioning, not
  authentication; it belongs in whatever module owns platform-admin tenant management, not this
  one. Flagging the gap explicitly rather than leaving it silently unaddressed.

### Session / token model {#session--token-model-1}

Tenant-user JWT payload:

```json
{ "sub": "<user id>", "tenantId": "<tenant id>", "email": "...", "role": "owner", "type": "tenant_user" }
```

Platform-admin JWT payload:

```json
{ "sub": "<platform_admin id>", "email": "...", "type": "platform_admin" }
```

Refresh JWT payload (signed with `JWT_REFRESH_SECRET`, only ever presented to
[`POST /v1/auth/refresh`](#post-v1authrefresh) via the cookie):

```json
{ "sub": "<users id>", "jti": "<random>", "type": "refresh" }
```

All three `type` values are the `JwtTokenType` enum (`src/api/auth/enums/jwt-token-type.enum.ts`)
— never a string literal at a call site.

`type` is what lets a single `JwtStrategy` validate both principal shapes without accidentally
treating a platform-admin token as a tenant-user token (which would have `tenantId`/`role` simply
`undefined`, and any `tenant_id`-scoped query built to tolerate that quietly becomes a
cross-tenant data leak). **`JwtStrategy.validate` fails closed**: it produces a request user only
for `type: "tenant_user"` (with a string `tenantId` and a known `role`) or `type: "platform_admin"`
(with string `sub`/`email`); a payload with any other `type`, or none at all — a refresh token
presented as a bearer token, a JWT from another issuer sharing the secret — is `401`, not a
tenant user with `tenantId: undefined`. **Every guard and every repository query in this module
must still check `type` before trusting `tenantId` or `role`** — this is the single most important
invariant in the whole split-hierarchy design, and it belongs in a check, not a comment.

## Error reference

Every error below uses the [error envelope](#conventions) shown in Conventions.
`message` values are exact strings to render to the user; `error` is the category string used for
programmatic branching in the frontend.

| `statusCode` | `error` | Applies to | Meaning |
|---|---|---|---|
| `400` | `Bad Request` (`BUSINESS_NAME_MISMATCH`) | delete-account | The typed business name does not match the tenant's. |
| `400` | `Bad Request` (`PASSWORD_REQUIRED`) | delete-account/request-otp | The owner has a password — confirm deletion with it, not a code. |
| `409` | `Conflict` (`ACCOUNT_DELETION_NOT_POSSIBLE`) | delete-account, request-otp | The caller is not an owner, or the business is not `active`/`pending_activation` (already scheduled, suspended or erased) — also what a double-click's second request gets. |
| `400` | `Bad Request` (`INVALID_OTP`) | delete-account | An SSO-only owner sent no code, or a wrong, spent or expired one. |
| `401` | `Unauthorized` (`INVALID_CURRENT_PASSWORD`) | delete-account | Wrong password (counts against the sign-in lockout). |
| `429` | `Too Many Requests` (`TOO_MANY_OTP_ATTEMPTS`) | delete-account | The per-account OTP attempt budget is spent. |
| `403` | `Forbidden` (`ACCOUNT_DISABLED`) | delete-account, request-otp | The owner has been disabled. |
| `403` | `Forbidden` (`ACCOUNT_SCHEDULED_FOR_DELETION`) | login (password) | The owner's own erasure is pending; the password was correct. Carries the scheduled date. |
| `400` | `Validation Error` | Any endpoint with a body | One or more `class-validator` rules failed — `message` is a space-joined list of the specific violations. The sentences written for people ("Enter a valid email address.", "Enter your password.", the verification-code and name/business-name messages, the password rules) are translated to the caller's language (`VALIDATION` in the message catalog, matched by their English text in `translateValidationMessage`); the technical ones that start with the API field (`page must not be less than 1`, `newPassword must be between 8 and 128 characters`, `property role should not exist`) are translated by shape, keeping the field name as the identifier the caller sent. Anything unrecognised stays English rather than being guessed at. |
| `400` | `Bad Request` (`INVALID_OR_EXPIRED_OTP`) | verify-email | Code not found, already used, past `expires_at`, or the account is no longer `pending_verification`. Same message for all causes — see [Security considerations](#security-considerations). |
| `400` | `Bad Request` (`INVALID_OR_EXPIRED_TOKEN`) | reset-password, invite preview/accept, invite SSO entry | Token not found, already used, or past `expires_at`. Same message for all three causes — see [Security considerations](#security-considerations). |
| `400` | `Bad Request` (`INVITE_EMAIL_MISMATCH`) | `GET /v1/auth/microsoft/callback` (`invite` intent) | The Microsoft/Google account used to accept the invite reported a different email than the one that was invited. Token is left unconsumed. |
| `400` | `Bad Request` (`NO_PASSWORD_SET`) | change-password | Target user is SSO-only (`password_hash IS NULL`). |
| `401` | `Unauthorized` (`INVALID_CREDENTIALS`) | login | Wrong password, unknown email, an SSO-only account attempting password login, **or an email currently locked out** (see [Brute-force protection](#brute-force-protection-throttling-and-per-account-lockout)) — one message for all four. Note: `pending_verification` is deliberately **not** in this list — see [`POST /v1/auth/login`](#post-v1authlogin), it's a 200 with a fresh OTP, not an error. |
| `401` | `Unauthorized` (`INVALID_CURRENT_PASSWORD`) | change-password | `currentPassword` didn't match. |
| `400` | `Bad Request` (`NEW_PASSWORD_SAME_AS_CURRENT`) | change-password | `newPassword` equals `currentPassword`. |
| `401` | `Unauthorized` (`INVALID_REFRESH_TOKEN`) | refresh | Expired, revoked, already-rotated-out, or otherwise invalid refresh token — including one whose owning user/tenant is no longer in good standing. |
| `401` | `Unauthorized` | Any `Bearer` route | Missing, malformed, or expired access token. |
| `403` | `Forbidden` (`ACCOUNT_DISABLED`) | login (also as `?error=` on an OAuth `login`/`invite` callback) | `users.status = 'disabled'` or `platform_admins.status = 'disabled'`. On **refresh**, this same condition revokes every refresh token that user has, but the response is `401 INVALID_REFRESH_TOKEN`, not a 403 — see [`POST /v1/auth/refresh`](#post-v1authrefresh). |
| `403` | `Forbidden` (`TENANT_SUSPENDED`) | login, any tenant-scoped route (also as `?error=` on an OAuth callback) | `tenants.status = 'suspended'`. On **refresh**, same as `ACCOUNT_DISABLED` above — revokes every refresh token, responds `401 INVALID_REFRESH_TOKEN`; this is what bounds a suspended tenant's residual access to one access-token lifetime. |
| `403` | `Forbidden` (`TENANT_ONLY`) | change-password | Bearer is a `platform_admin` token — this route is tenant-user only. |
| `403` | `Forbidden` | `@Roles('owner')` routes | Authenticated as a `member`, not an `owner`. |
| `404` | `Not Found` | (reserved) | Not currently used by this module — auth endpoints prefer `401`/`403`/`400` over `404` specifically to avoid confirming/denying resource existence (see enumeration-prevention note below). |
| `409` | `Conflict` (`EMAIL_ALREADY_REGISTERED`) | signup | An account already exists at this email, under any status or tenant — whether caught by the pre-check or by the `idx_users_email_active` unique violation in a concurrent-signup race. See [`POST /v1/auth/signup`](#post-v1authsignup). |
| `409` | `Conflict` (`EMAIL_ALREADY_MEMBER`) | invite | Email already has an active/invited `users` row on this tenant. |
| `413` | `Payload Too Large` | Any endpoint with a body | Body exceeded the global `1mb` `body-parser` limit. Raised by Express middleware before Nest's pipeline as an `http-errors` error, not an `HttpException` — `ErrorHandlerService` recognises that shape (4xx + `expose: true`) and maps it to its own status instead of a `500`. |
| `429` | `Too Many Requests` | Any route | `ThrottlerGuard` limit exceeded for that route's tier (`Retry-After` header set) — see the per-route throttle columns above and the overview's [Rate limiting](./overview.md#rate-limiting-throttler) section. |
| `500` | `Internal Server Error` | Any route | Unhandled exception. `traceId` is the only thing safe to show the user; full detail is server-side only, per `ErrorHandlerService.handleUnhandledError`. |

OAuth-specific redirect error codes (appended as `?error=<code>` on callback failure, not JSON —
see [Conventions](#conventions)):

| Code | Meaning |
|---|---|
| `NO_ACCOUNT_FOUND` | `login`-intent callback found no matching `user_identities`/`platform_admin_identities` row. |
| `DIRECTORY_MISMATCH` | Tenant has an active `tenant_identity_providers` restriction and the IdP token's directory (`tid` claim) didn't match. Raised by the `login`, returning-user `signup`, **and `invite`** branches alike — see the shared rule at the top of [`GET /v1/auth/microsoft/callback`](#get-v1authmicrosoftcallback). |
| `ACCOUNT_DISABLED` / `TENANT_SUSPENDED` | The `login` or `invite` branch found the identity but the user is `disabled` or the tenant `suspended` — same conditions as the JSON `403`s above, delivered as a redirect because the callback is a top-level navigation. |
| `INVALID_STATE` | The signed `state` parameter failed verification, or is older than `OAUTH_STATE_TTL_MINUTES` — possible CSRF attempt or an expired/stale link. |
| `INVITE_EMAIL_MISMATCH` | `invite`-intent callback's IdP email didn't match the invited email — see [`GET /v1/auth/invite/:token/microsoft`](#get-v1authinvitetokenmicrosoft). |
| `PROVIDER_ERROR` | The IdP itself returned an error (user declined consent, provider outage, etc). |

## Security considerations

- **Token generation** — hashing a guessable token protects nothing, so the generation is part of
  the contract, not an implementation detail: the raw invite/reset/verify-email token is **32 bytes
  from `crypto.randomBytes`** (256 bits — the same source and size `api-key.service.ts` already
  uses), encoded **base64url** (43 chars, URL-safe without escaping in the emailed link). At that
  entropy the 20 req/min preview endpoint below is irrelevant to brute force — the ceiling is the
  randomness, not the rate limit — which is the point of fixing the size here rather than leaning
  on the throttler.
- **Token storage** — `user_auth_tokens.token_hash` and `platform_admin_auth_tokens.token_hash`
  store a hash of the token, never the raw value (mirrors how `password_hash` is never the raw
  password). The hash is **SHA-256, hex** (64 chars, fits `VARCHAR(255)`, and deterministic so the
  unique index on `token_hash` is the lookup key) — *not* bcrypt/argon2: those exist to slow down
  guessing of low-entropy secrets like passwords, and would defeat the indexed lookup, which a
  256-bit random token doesn't need. The raw token exists only in the emailed link and the client's
  request — a database read (backup, replica lag snapshot, insider access) can't be used to mint
  valid tokens.
- **No user enumeration** — [`POST /v1/auth/forgot-password`](#post-v1authforgot-password) returns
  the same `200` and message whether or not the email exists, and does the same DB work either way
  (a dummy hash comparison on the not-found path) so response timing doesn't leak the answer
  either. [`GET /v1/auth/invite/:token`](#get-v1authinvitetoken) and the token-consuming endpoints
  return the same `INVALID_OR_EXPIRED_TOKEN` for "never existed," "already used," and "expired" —
  distinguishing them would tell an attacker which guesses are "close."
- **Generic login failure message** — [`POST /v1/auth/login`](#post-v1authlogin)'s
  `INVALID_CREDENTIALS` covers wrong-password, unknown-email, and right-email-but-SSO-only with
  one message, for the same reason.
- **Password complexity** — enforced by `class-validator` at the DTO layer (`SignupDto`,
  `ChangePasswordDto.newPassword`; the still-unwired `ResetPasswordDto` / `InviteAcceptDto`
  reuse the same regex, `PASSWORD_PATTERN` in `auth.constants.ts`): 8–128 chars and at most 72 UTF-8 bytes, at least one
  upper, one lower, one digit, one special character — "special" being any non-alphanumeric,
  non-whitespace character rather than a fixed allowlist, so `#`/`-`/`_` passphrases aren't
  rejected. Hashing algorithm/cost factor is out of this document's scope — see
  `HashingService`, not duplicated here to avoid the two drifting apart.
- **Token lifetimes** — access tokens are short (15 min) specifically so a leaked access token
  (browser XSS, log accident) has a small blast-radius window; refresh tokens are long-lived but
  rotate on every use and are revoked wholesale on logout, password reset, **password change**,
  and on any refresh that finds the user disabled or the tenant suspended. See
  [Configuration](#configuration) for the env vars and the flagged `refresh_tokens` table
  prerequisite. Access and refresh tokens are signed with **different secrets in production**,
  enforced at boot — see `JWT_REFRESH_SECRET` in [Configuration](#configuration).
- **Both tokens travel as httpOnly cookies — the access token's JSON copy is a second, separate
  channel, not the only one** — the tenant-user password path (`login`/`verify-email`/`refresh`)
  sets `refresh_token` as an httpOnly, `Secure`-in-production cookie scoped to `/v1/auth`, and
  `access_token` the same way but scoped to `/` (every route needs it, not just the auth module's
  own). Neither is ever serialized into a response a script on the page could read directly out of
  the cookie itself. This is the direct mitigation for the "browser XSS" scenario named above — a
  script can forge neither cookie's value. The access token is *additionally* returned as plain
  JSON (`TokenResponseDto.accessToken`) purely so the frontend can hold its own copy client-side
  (`localStorage`, since an httpOnly cookie's value is invisible to its own JS) and attach it as a
  `Bearer` header — `JwtStrategy` accepts either, cookie first, falling back to the header, so a
  same-origin browser request authenticates from the cookie alone while a non-cookie caller
  (Swagger UI, a future mobile client, service-to-service) still works off the header. The refresh
  token has no such JSON copy at all — it never needs to be attached as a header anywhere.
- **Brute-force protection is throttling *and* per-account lockout, not throttling alone** — the
  per-IP throttles don't stop distributed credential stuffing. See [Brute-force
  protection](#brute-force-protection-throttling-and-per-account-lockout) below for the Redis
  failure counter that does, and why it must fail with the same `INVALID_CREDENTIALS` as a wrong
  password.
- **`state` signing on every OAuth entry route** — [`GET
  /v1/auth/microsoft/signup`](#get-v1authmicrosoftsignup) encodes `businessName`/`ownerName`;
  [`GET /v1/auth/invite/:token/microsoft`](#get-v1authinvitetokenmicrosoft) encodes `inviteToken`;
  every route encodes `intent`. All of it must be signed (HMAC with `JWT_SECRET` or similar) and
  verified on callback before any of it is trusted. An unsigned `state` would let an attacker not
  just spoof a cosmetic `businessName` but, far more seriously, flip `intent` itself — e.g. turn a
  `login` attempt into a `signup`, or graft an arbitrary `inviteToken` onto someone else's OAuth
  completion. This is why [`GET /v1/auth/microsoft/callback`](#get-v1authmicrosoftcallback)
  verifies `state`'s signature and TTL **before** looking at `intent` at all, unconditionally, for
  every branch.
- **Invite email match, not just a valid token** — a valid, unexpired invite token proves someone
  has the link; it does not by itself prove they're the invited person. [`GET
  /v1/auth/invite/:token/microsoft`](#get-v1authinvitetokenmicrosoft) additionally requires the
  IdP-verified email from the OAuth completion to exactly match the invited `users.email`, and
  rejects (without consuming the token) if it doesn't. The password-path equivalent needs no such
  check — setting a password against a specific token *is* the identity proof there.
- **Token consumption is a compare-and-swap, not a check-then-write** — every endpoint that spends
  a `user_auth_tokens`/`platform_admin_auth_tokens` row (`verify-email`, `reset-password`,
  `invite/accept`, the `invite` branch of the OAuth callback) does so via `UPDATE ... SET
  used_at = now() WHERE id = ? AND used_at IS NULL`, not a `SELECT` followed by a separate
  `UPDATE`. Two tabs submitting the same link at once make the second call see zero rows affected
  and fail as already-used, rather than both succeeding. See `PLAN.md` §8.7.
- **Refresh-token rotation is strict single-use today, atomically** — see
  [`POST /v1/auth/refresh`](#post-v1authrefresh): revoke-and-replace is one transaction gated on
  the revoke's row count, so a token can never mint two sessions. The cost is that a legitimate
  double-tab race gets one `401` (that tab re-logs in); the reuse grace window that would soften
  this (`PLAN.md` §8.19) is the documented follow-up, not yet built.
- **Tenant suspension is not instant for a token already in a user's hand** — access tokens are
  signature-only stateless JWTs; suspending a tenant blocks new logins/refreshes immediately but
  not a request riding an access token issued before the suspension, for up to its remaining
  15-minute lifetime. Accepted, not fixed — see `PLAN.md` §8.20 for the tradeoff. The word
  "refreshes" in that sentence is load-bearing: the bound is only 15 minutes because
  [`POST /v1/auth/refresh`](#post-v1authrefresh) re-checks `tenants.status` and `users.status` and
  revokes the family on failure. An implementation that validates only the refresh token itself
  has no bound at all.
- **Tenant/type confusion is the highest-severity mistake available in this module** — see the
  `type` claim discussion in [Session / token model](#session--token-model-1). A guard or
  repository method that trusts `tenantId` without checking `type === 'tenant_user'` first would
  let a platform-admin token pass a tenant-scoping check with `tenantId: undefined`, and depending
  on how the SQL is built, `WHERE tenant_id = $1` with `$1 = undefined` can behave very differently
  from "match nothing" depending on the query builder — verify this explicitly in tests, don't
  assume.
- **Directory restriction (`tenant_identity_providers`) is opt-in, not default — but once opted
  in, it is total** — most tenants (including this engagement's client) have no row here and
  accept any Microsoft account. Only set one up when the client explicitly wants "our Entra
  directory only," per the overview's [Frontend/backend boundary](./overview.md#frontend--backend-boundary).
  When a row exists it governs every SSO completion that produces a session for that tenant —
  login, returning-user signup, and invite acceptance — not login alone; see the shared rule at the
  top of [`GET /v1/auth/microsoft/callback`](#get-v1authmicrosoftcallback). A restriction with an
  exception is a restriction an attacker takes the exception to.
- **Email comparison is on normalized values, everywhere** — see [Email
  normalization](#email-normalization). This matters most for `INVITE_EMAIL_MISMATCH`: an
  "exact match" security check that is secretly case-sensitive both rejects legitimate invitees
  and invites a "just compare case-insensitively here" patch that then quietly disagrees with how
  the row was stored.
- **Single-session logout is not offered** — [`POST
  /v1/auth/logout`](#post-v1authlogout) revokes every refresh token for the user, all devices at
  once. Acceptable for this engagement's single-user-per-tenant scope; revisit if multi-device
  "sign out of other sessions only" becomes a real requirement, since it needs the
  `refresh_tokens` table to carry a device/session identifier, not just a hash.

### Brute-force protection: throttling and per-account lockout {#brute-force-protection-throttling-and-per-account-lockout}

The per-route throttles in the endpoint tables are keyed on **client IP** (`@nestjs/throttler`'s
default tracker). Two consequences follow. First, behind the load balancer Express's `trust proxy`
must be set, or every request arrives from the LB's address, shares one bucket, and one tenant's
burst throttles everyone. Second — the real gap — per-IP is the wrong axis for the attack the
throttle was described as blunting: credential stuffing arrives from many addresses, a few attempts
each, all aimed at one account, and never trips a per-IP limit.

So `POST /v1/auth/login` additionally keeps a **per-email failure counter in Redis**
(`LoginAttemptService`). The platform-admin login route does not exist yet and will need the same
treatment when it does.

- Key `auth:login-fail:<sha256(normalized email)>` (normalized per [Email
  normalization](#email-normalization); hashed so the key space doesn't leak addresses to anyone
  with Redis read access).
- Incremented on every `INVALID_CREDENTIALS` outcome; window
  `LOGIN_LOCKOUT_WINDOW_SECONDS` (900, in `auth.constants.ts`); deleted the moment a password is
  proven — before the status branches, so a `pending_verification` or suspended account that typed
  the right password does not keep burning attempts it already passed.
- Once it reaches `LOGIN_LOCKOUT_THRESHOLD` (10), further attempts for that email are rejected for
  the rest of the window **with the identical `401 INVALID_CREDENTIALS`**. No distinct "locked"
  code — that would tell an attacker both that the account exists and that they've found the
  threshold.
- The locked path skips the DB lookup and the real password comparison, but still runs one decoy
  bcrypt comparison, so the faster response does not become the tell.
- Fixed window, not sliding: the TTL is set only when the counter is created, so a persistent
  attacker cannot hold a victim locked out indefinitely by continuing to guess.

This is an application-layer counter, not a `users` column: no migration, and it never touches
`users.status`, so a lockout can't be weaponized to *disable* someone's account — only to slow the
attacker down for one window. A legitimate user with the right password gets in the moment the
window lapses; one who genuinely forgot has the forgot-password path, which is unaffected.
