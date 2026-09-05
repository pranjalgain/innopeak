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
| `JWT_REFRESH_SECRET` | No (falls back to `JWT_SECRET`) | Signs refresh tokens — set separately in production so an access-token leak can't be replayed as a refresh token. |
| `JWT_ACCESS_EXPIRY` | No, default `15m` | Access token TTL. Currently hardcoded to 15 minutes in `auth.module.ts`; promote to an env var so staging/local can lengthen it. |
| `JWT_REFRESH_EXPIRY` | No, default `7d` | Refresh token TTL. Currently hardcoded to 7 days (`604800` seconds) in `token.service.ts`; promote to an env var alongside `JWT_ACCESS_EXPIRY`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | Only if Google social auth is enabled for any tenant | Existing — Google OAuth app credentials. See the overview's [Supported login methods](./overview.md#supported-login-methods) for why this is "social auth," not "SSO," by default. |
| `MICROSOFT_CLIENT_ID` | Yes (this engagement) | Entra ID app registration client ID. |
| `MICROSOFT_CLIENT_SECRET` | Yes (this engagement) | Entra ID app registration client secret. |
| `MICROSOFT_CALLBACK_URL` | Yes (this engagement) | Must exactly match the redirect URI registered on the Entra app. |
| `MICROSOFT_TENANT_ID` | No, default `common` | Restricts which Entra directories can complete the OAuth handshake at the provider level. `common` accepts any organizational or personal Microsoft account — use a specific directory ID here only if *every* InnoPeak tenant should be restricted to one Entra org, which is not this engagement's case. Per-tenant directory restriction is instead enforced in application code via `tenant_identity_providers.provider_tenant_id` — see [`GET /v1/auth/microsoft/callback`](#get-v1authmicrosoftcallback). |
| `FRONTEND_URL` | Yes | Base URL the OAuth callback routes redirect back to with the token pair (or error code) appended. |
| `INVITE_TOKEN_TTL_HOURS` | No, default `72` | Expiry window written to `password_reset_tokens.expires_at` / `platform_admin_invites.expires_at` for `purpose = 'invite'`. |
| `RESET_TOKEN_TTL_HOURS` | No, default `1` | Same, for `purpose = 'reset'`. |
| `VERIFY_EMAIL_TOKEN_TTL_HOURS` | No, default `24` | Same, for `purpose = 'verify_email'` (tenant users only — platform admins have no email-verification step, see [Data model quick reference](#data-model-quick-reference)). |
| `OAUTH_STATE_TTL_MINUTES` | No, default `10` | How long a signed OAuth `state` payload (see [`GET /v1/auth/microsoft/callback`](#get-v1authmicrosoftcallback)) is accepted after issuance — bounds how long an abandoned OAuth redirect can be resumed. |
| `JWT_REFRESH_REUSE_GRACE_SECONDS` | No, default `10` | Window during which presenting an already-rotated refresh token replays the same replacement pair instead of being treated as theft — see [`POST /v1/auth/refresh`](#post-v1authrefresh) and `PLAN.md` §8.19. |

**Schema prerequisite not yet in the migrations**: refresh-token rotation needs a
`refresh_tokens` table (id, `user_id` or `platform_admin_id`, `token_hash`, `revoked_at`,
`expires_at`, `created_at`) to support revocation on logout and rotation-reuse detection. The
grace-window replay behavior described under [`POST
/v1/auth/refresh`](#post-v1authrefresh) needs one more thing from this same table: a way to find
"the pair this token was replaced by" (e.g. a self-referencing `replaced_by_token_id`), not just
whether a token is revoked — otherwise a replayed, already-rotated token has nothing to return.
Neither the migrations nor `schema.dbml` have this table today — it's a required follow-up
migration before refresh/logout/grace-window replay can be implemented as specified, called out
here rather than silently assumed. See `PLAN.md` §8.19.

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

**`password_reset_tokens`** — `id`, `user_id`, `token_hash` (never store the raw token — see
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

**`platform_admin_invites`** — mirrors `password_reset_tokens`, but `purpose` is
`platform_admin_invite_purpose` (`invite` \| `reset` — no `verify_email`, since a platform admin
is always invited by another admin and never self-registers).

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
| `POST` | `/v1/auth/refresh` | Public | 20 / min |
| `POST` | `/v1/auth/logout` | Bearer | 30 / min |
| `GET` | `/v1/auth/me` | Bearer | 30 / min |

Every OAuth entry route below — signup, login, and (further down)
[invite-accept](#get-v1authinvitetokenmicrosoft) — funnels into **one** callback per provider,
`GET /v1/auth/microsoft/callback` / `GET /v1/auth/google/callback`, rather than each having its
own callback URL. What the callback does depends entirely on an `intent` (`signup` \| `login` \|
`invite`) signed into the `state` parameter by whichever entry route started the redirect — see
that route's own section below. An earlier draft of this document gave signup and login separate
callback URLs; that fell apart the moment invite-acceptance needed OAuth too, since it's neither
signup nor a plain login. One callback, dispatching on signed `state`, is the pattern every entry
point uses consistently instead.

#### `POST /v1/auth/signup`

Owner self-registration, password path. Corresponds to the password branch of `PLAN.md` §4.3a.
Creates the tenant, owner, and default settings together in one transaction — but first checks for
a `pending_verification` `users` row already sitting at this exact email (an earlier, unfinished
signup attempt): if one exists, this call **resends** the verification email against that existing
row instead of creating a second tenant (`PLAN.md` §8.10's resumable-signup note — including the
tie-break rule for the rare case more than one such row exists, and the missing supporting index
this lookup needs before it ships). If none exists,
it creates a new tenant regardless of whether this email already owns *other*, already-`active`
tenants elsewhere — the same email legitimately owning more than one tenant is supported by design
(`PLAN.md` §2, `users (tenant_id, email)` is scoped per-tenant, not globally unique). There is
deliberately **no "email already registered" error** on this endpoint for that reason; see
`PLAN.md` §8.18 for the one race this still leaves open (two truly simultaneous first-time
signups) and why it's accepted rather than fixed.

**This multi-tenant-per-email flexibility is specific to the password path.** The SSO signup
route below has a different, harder constraint — see its own section.

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
| `businessName` | string | required, 1–255 chars → `tenants.name`. Ignored if this call resumes an existing pending signup — the original submission wins. |
| `ownerName` | string | required, 1–255 chars → `users.name` |
| `email` | string | required, valid email format |
| `password` | string | required, 8–128 chars, upper + lower + digit + special char (same pattern as the existing `RegisterDto`) |

Success `201` (new tenant) or `200` (resumed an existing pending signup — `resumed: true`):

```json
{
  "tenantId": "0190f3b2-...",
  "userId": "0190f3b2-...",
  "status": "pending_verification",
  "resumed": false,
  "message": "Verification email sent to jane@thecoffeehouse.com"
}
```

Errors: `400` validation only.

#### `GET /v1/auth/microsoft/signup`

Starts the SSO signup flow. Query params `businessName` and `ownerName` (same validation as
above) are signed into the OAuth `state` parameter alongside `intent: 'signup'` — never trust
`state` without verifying its signature in the callback, see [Security
considerations](#security-considerations). Redirects (`302`) to Microsoft's consent screen.

| Query param | Required | Notes |
|---|---|---|
| `businessName` | No | Signed into `state` when present. The shipped OnboardingSignup screen has no business-name field — it derives the name from the Google Business Profile connected in step 2 — so this route must not require it. See `apps/documentation/docs/frontend/overview.md`. |
| `ownerName` | No | Same: falls back to the name the IdP reports for the authenticated account. |

Because both are optional, the callback's `signup` branch has to tolerate their absence and
create the tenant with a provisional name, which the connect step then overwrites. That is the
sequence the frontend actually implements: Microsoft SSO first, Google Business Profile second,
business identity supplied by the latter.

`GET /v1/auth/google/signup` is the same shape, `provider = 'google'`.

#### `POST /v1/auth/login`

Password login for an existing, `active` user.

Request:

```json
{ "email": "jane@thecoffeehouse.com", "password": "StrongP@ss1" }
```

Success `200`:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "0190f3b2-...",
    "tenantId": "0190f3aa-...",
    "name": "Jane Doe",
    "email": "jane@thecoffeehouse.com",
    "role": "owner"
  }
}
```

Errors: `401 INVALID_CREDENTIALS` (wrong password, or user has no `password_hash` — i.e. an
SSO-only account trying the password form; the message is intentionally the same generic text as
a wrong password, see [Security considerations](#security-considerations)), `403
ACCOUNT_PENDING_VERIFICATION` (`status = 'pending_verification'`), `403 ACCOUNT_DISABLED`
(`status = 'disabled'`), `403 TENANT_SUSPENDED` (`tenants.status = 'suspended'`).

#### `GET /v1/auth/microsoft`

Login-only entry. `state` carries `intent: 'login'` and nothing else — no business/invite context
to pass through. `302` to Microsoft. `GET /v1/auth/google` mirrors this, `provider = 'google'`.

#### `GET /v1/auth/microsoft/callback`

The single Microsoft callback for every entry route above it. Verifies `state`'s signature and
`OAUTH_STATE_TTL_MINUTES` freshness first, unconditionally — an invalid or expired `state` is a
`302` to `${FRONTEND_URL}/login?error=INVALID_STATE` regardless of intent. Then branches on
`state.intent`:

- **`login`** — looks up `user_identities WHERE provider = 'entra_id' AND provider_user_id = <sub
  claim>`. If found, and the owning tenant has an active `tenant_identity_providers` row for
  `entra_id`, confirm the token's directory (`tid` claim) matches `provider_tenant_id` before
  issuing tokens — this is the one place `MICROSOFT_TENANT_ID=common` is deliberately loosened at
  the provider level and tightened back up in application code per tenant, per the overview's
  [Frontend/backend boundary](./overview.md#frontend--backend-boundary). If no matching identity
  exists at all: `302` to `${FRONTEND_URL}/login?error=NO_ACCOUNT_FOUND` — login never silently
  creates a tenant, only the `signup` intent does that. On success: `302` to
  `${FRONTEND_URL}/dashboard?access_token=...&refresh_token=...`.
- **`signup`** — reads `businessName`/`ownerName` back out of `state`, plus the verified email +
  provider `sub` claim from Microsoft's token. **First looks up `user_identities WHERE
  provider = 'entra_id' AND provider_user_id = <sub claim>`** — unlike the password path,
  this check is not optional: `user_identities` is unique on `(provider, provider_user_id)`
  *globally*, not per-tenant (`PLAN.md` §2, §8.21), so the same Microsoft account can never back
  more than one `users` row anywhere in the system. If a match is found, this is functionally a
  returning user, not a new signup: skip tenant creation entirely and issue tokens for their
  existing account exactly as the `login` branch does, `302` to
  `${FRONTEND_URL}/dashboard?...`. Only when no match exists does it proceed, in one transaction
  (`PLAN.md` §4.3a, SSO branch): `INSERT tenants` (`status = 'active'`), `INSERT users`
  (`role = 'owner'`, `status = 'active'`, `email_verified_at = now()`, `password_hash = NULL`),
  `INSERT tenant_settings` (defaults), `INSERT user_identities` (`provider = 'entra_id'`). No
  email-verification step and no "already registered" *error* — see
  [`POST /v1/auth/signup`](#post-v1authsignup) for why "error" isn't the right response even
  when the account already exists. On success: `302` to
  `${FRONTEND_URL}/onboarding/connect?access_token=...&refresh_token=...`.
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
query-param approach** to match how the password-path endpoints return tokens in a JSON body
(one token-delivery shape for the frontend to handle, not two) — but the cookie approach is
strictly more secure (no token transiting browser history/referrer/logs) and should be revisited
before this ships if the frontend can accommodate it.

#### `POST /v1/auth/refresh`

Request: `{ "refreshToken": "eyJ..." }`

Success `200`: new `{ "accessToken": "...", "refreshToken": "..." }` pair — rotation means the
old refresh token is invalidated in the same call (needs the `refresh_tokens` table flagged in
[Configuration](#configuration)).

If the presented token was itself already rotated out **within the last
`JWT_REFRESH_REUSE_GRACE_SECONDS`** (default 10s), this call is treated as a harmless replay of a
racing double-tab request, not theft: it returns the same replacement pair issued for that
rotation instead of erroring. Reuse *outside* that window — or reuse of a token that's already
been replayed once under the grace rule — revokes the entire token family and fails as below. See
`PLAN.md` §8.19 for the reasoning.

Errors: `401 INVALID_REFRESH_TOKEN` (expired, revoked, or reused outside the grace window).

#### `POST /v1/auth/logout`

Bearer. No request body. Revokes every refresh token belonging to the current user (all
sessions/devices) — a single-session logout is intentionally not offered as a separate endpoint
to keep the revocation model simple; see [Security considerations](#security-considerations) if
that changes.

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
| `GET` | `/v1/auth/verify-email` | Public | 10 / min |
| `POST` | `/v1/auth/forgot-password` | Public | 5 / min |
| `POST` | `/v1/auth/reset-password` | Public | 5 / min |
| `POST` | `/v1/auth/change-password` | Bearer | 5 / min |

#### `GET /v1/auth/verify-email`

Query: `?token=<raw token>`. Looks up `password_reset_tokens WHERE token_hash = hash(token) AND
purpose = 'verify_email' AND used_at IS NULL AND expires_at > now()`; on match, sets
`users.email_verified_at = now()`, `users.status = 'active'`, and the token's `used_at`. Password
path only — SSO signups never create a `verify_email` token, see [Auth
flows](./overview.md#auth-flows) item 5.

Success `200`: `{ "message": "Email verified. You can now log in." }`.

Errors: `400 INVALID_OR_EXPIRED_TOKEN` — deliberately the same message whether the token is
malformed, already used, or expired, to avoid distinguishing "this token existed once" from "this
token never existed."

#### `POST /v1/auth/forgot-password`

Request: `{ "email": "jane@thecoffeehouse.com" }` (existing `ForgotPasswordDto`).

Success `200` **always**, regardless of whether the email matches a `users` row:
`{ "message": "If an account exists for this email, a reset link has been sent." }`. If a match
exists, creates a `password_reset_tokens` row (`purpose = 'reset'`) and sends the email; if not,
does nothing but still returns the same response and takes comparable time (see [Security
considerations](#security-considerations) — enumeration prevention).

#### `POST /v1/auth/reset-password`

Request (existing `ResetPasswordDto`): `{ "token": "...", "newPassword": "NewStr0ng@Pass" }`.
Same validation and error shape as [`/v1/auth/verify-email`](#get-v1authverify-email)'s token
lookup, `purpose = 'reset'`. On success, updates `password_hash`, marks the token used, and — since
a successful reset is a strong signal the account may have been compromised — should also revoke
all existing refresh tokens for the user (forces re-login everywhere).

Success `200`: `{ "message": "Password reset. Please log in with your new password." }`.

Errors: `400 INVALID_OR_EXPIRED_TOKEN`, `400` validation (password complexity).

#### `POST /v1/auth/change-password`

Bearer. Request (existing `ChangePasswordDto`): `{ "currentPassword": "...", "newPassword": "..." }`.

Success `200`: `{ "message": "Password changed" }`.

Errors: `401 INVALID_CURRENT_PASSWORD`, `400 NO_PASSWORD_SET` (SSO-only user with
`password_hash IS NULL` — this endpoint isn't how such a user sets an initial password; that
would be a separate "set password" flow, not modeled here since it's out of scope for a
Microsoft-only engagement), `400` validation.

### Team / invite

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/auth/invite` | Bearer, `@Roles('owner')` | 10 / min |
| `GET` | `/v1/auth/invite/:token` | Public | 20 / min |
| `POST` | `/v1/auth/invite/accept` | Public | 10 / min |
| `GET` | `/v1/auth/invite/:token/microsoft` | Public | 30 / min |
| `GET` | `/v1/auth/invite/:token/google` | Public | 30 / min |

Not exercised by this client's Microsoft-only, single-user scope-down (see the overview's
[Frontend / backend boundary](./overview.md#frontend--backend-boundary)) —
documented because the schema (`user_role.member`, `token_purpose.invite`) and backend fully
support it; only the frontend currently has no screen for it.

#### `POST /v1/auth/invite`

Owner-only. Request: `{ "email": "member@thecoffeehouse.com" }`. Creates a `users` row
(`role = 'member'`, `status = 'invited'`, no `password_hash`, `invited_by_user_id` set to the
calling owner's own `id` — taken from the authenticated request, never from the request body, so
it can't be spoofed) and a `password_reset_tokens` row (`purpose = 'invite'`), sends the invite
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
token the same way as [`/v1/auth/verify-email`](#get-v1authverify-email) (`purpose = 'invite'`),
sets `password_hash`, `UPDATE users SET status = 'active', email_verified_at = now()` — clicking a
token emailed to this specific address is proof of ownership regardless of which method finishes
the invite, so this is set here unconditionally, not only on the SSO path below (`PLAN.md` §4.3b)
— and consumes the token via the guarded compare-and-swap `UPDATE password_reset_tokens SET
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

First validates the token is unexpired and unused — read-only, does not consume it — so a dead
invite link fails fast with `400 INVALID_OR_EXPIRED_TOKEN` before ever redirecting to Microsoft.
If valid, signs `{ intent: 'invite', inviteToken: token }` into `state` and redirects (`302`) to
Microsoft's consent screen. Completion happens back at [`GET
/v1/auth/microsoft/callback`](#get-v1authmicrosoftcallback)'s `invite` branch:

- Decodes `inviteToken` from `state`, re-validates it's still unexpired/unused, and loads the
  `invited`-status `users` row it belongs to.
- **Confirms the IdP-verified email from this OAuth completion exactly matches that user's
  `email`.** If it doesn't, the request is rejected as `400 INVITE_EMAIL_MISMATCH` and the token
  is **not** consumed — this is the one check that stops someone other than the invited person
  from accepting the link with their own unrelated Microsoft account; see [Security
  considerations](#security-considerations).
- On a match: `INSERT user_identities`, `UPDATE users SET status = 'active', email_verified_at =
  now()`, consume the token with the same guarded compare-and-swap as the password path above,
  issue tokens, `302` to `${FRONTEND_URL}/dashboard?access_token=...&refresh_token=...`.

`GET /v1/auth/invite/:token/google` is the same shape, `provider = 'google'`.

## Platform admin API

Structurally identical to the tenant user API above, against `platform_admins` /
`platform_admin_identities` / `platform_admin_invites` instead of `users` /
`user_identities` / `password_reset_tokens` — see [Auth flows](./overview.md#auth-flows) item 6.
Differences called out explicitly; everywhere else, substitute table names and re-read the
matching tenant-user section above.

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
  **That seed does not exist yet**: `src/db/seeds/` holds only the boilerplate
  `001_roles_permissions.sql` and `002_admin_user.sql`, which target `roles`/`permissions`/
  `user_roles` — none of which any migration creates — and insert `users` columns absent from this
  schema (`first_name`, `last_name`, `is_active`, `is_email_verified`; `users.role` itself *does*
  exist, `0002_tenant_auth.sql:65`) — so `pnpm db:seed` would fail
  against this schema, not seed an admin. Replacing those two files with a `platform_admins` root
  seed is a required follow-up. Every admin after the root must arrive via
  `POST /v1/platform-admin/auth/invite` from an existing admin.
- **The invite-acceptance mechanics are identical to the tenant-user path** — `GET
  /v1/platform-admin/auth/invite/:token/microsoft` signs `{ intent: 'invite', inviteToken: token
  }` into `state`; the callback's `invite` branch requires the IdP-verified email to match the
  invited `platform_admins.email` exactly (`400 INVITE_EMAIL_MISMATCH` otherwise, token left
  unconsumed) and consumes `platform_admin_invites.used_at` via the same guarded compare-and-swap
  as `password_reset_tokens` (`PLAN.md` §8.7's fix "applies identically... it's the same mechanic
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
  ordinary `users` row (`role = 'owner'`, `status = 'invited'`) and a `password_reset_tokens` row
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

`type` is what lets a single `JwtStrategy` validate both without accidentally treating a
platform-admin token as a tenant-user token (which would have `tenantId`/`role` simply
`undefined`, and any `tenant_id`-scoped query built to tolerate that quietly becomes a
cross-tenant data leak). **Every guard and every repository query in this module must check
`type` before trusting `tenantId` or `role`** — this is the single most important invariant in
the whole split-hierarchy design, and it belongs in a check, not a comment.

## Error reference

Every error below uses the [error envelope](#conventions) shown in Conventions.
`message` values are exact strings to render to the user; `error` is the category string used for
programmatic branching in the frontend.

| `statusCode` | `error` | Applies to | Meaning |
|---|---|---|---|
| `400` | `Validation Error` | Any endpoint with a body | One or more `class-validator` rules failed — `message` is a comma-joined list of the specific violations. |
| `400` | `Bad Request` (`INVALID_OR_EXPIRED_TOKEN`) | verify-email, reset-password, invite preview/accept, invite SSO entry | Token not found, already used, or past `expires_at`. Same message for all three causes — see [Security considerations](#security-considerations). |
| `400` | `Bad Request` (`INVITE_EMAIL_MISMATCH`) | `GET /v1/auth/microsoft/callback` (`invite` intent) | The Microsoft/Google account used to accept the invite reported a different email than the one that was invited. Token is left unconsumed. |
| `400` | `Bad Request` (`NO_PASSWORD_SET`) | change-password | Target user is SSO-only (`password_hash IS NULL`). |
| `401` | `Unauthorized` (`INVALID_CREDENTIALS`) | login | Wrong password, unknown email, or an SSO-only account attempting password login — one message for all three. |
| `401` | `Unauthorized` (`INVALID_CURRENT_PASSWORD`) | change-password | `currentPassword` didn't match. |
| `401` | `Unauthorized` (`INVALID_REFRESH_TOKEN`) | refresh | Expired, revoked, or already-rotated-out refresh token. |
| `401` | `Unauthorized` | Any `Bearer` route | Missing, malformed, or expired access token. |
| `403` | `Forbidden` (`ACCOUNT_PENDING_VERIFICATION`) | login | `users.status = 'pending_verification'`. |
| `403` | `Forbidden` (`ACCOUNT_DISABLED`) | login | `users.status = 'disabled'` or `platform_admins.status = 'disabled'`. |
| `403` | `Forbidden` (`TENANT_SUSPENDED`) | login, any tenant-scoped route | `tenants.status = 'suspended'`. |
| `403` | `Forbidden` | `@Roles('owner')` routes | Authenticated as a `member`, not an `owner`. |
| `404` | `Not Found` | (reserved) | Not currently used by this module — auth endpoints prefer `401`/`403`/`400` over `404` specifically to avoid confirming/denying resource existence (see enumeration-prevention note below). |
| `409` | `Conflict` (`EMAIL_ALREADY_MEMBER`) | invite | Email already has an active/invited `users` row on this tenant. There is deliberately no equivalent "already registered" conflict on tenant *signup* — see [`POST /v1/auth/signup`](#post-v1authsignup). |
| `429` | `Too Many Requests` | Any route | `ThrottlerGuard` limit exceeded for that route's tier — see the per-route throttle columns above and the overview's [Rate limiting](./overview.md#rate-limiting-throttler) section. |
| `500` | `Internal Server Error` | Any route | Unhandled exception. `traceId` is the only thing safe to show the user; full detail is server-side only, per `ErrorHandlerService.handleUnhandledError`. |

OAuth-specific redirect error codes (appended as `?error=<code>` on callback failure, not JSON —
see [Conventions](#conventions)):

| Code | Meaning |
|---|---|
| `NO_ACCOUNT_FOUND` | `login`-intent callback found no matching `user_identities`/`platform_admin_identities` row. |
| `DIRECTORY_MISMATCH` | Tenant has an active `tenant_identity_providers` restriction and the IdP token's directory (`tid` claim) didn't match. |
| `INVALID_STATE` | The signed `state` parameter failed verification, or is older than `OAUTH_STATE_TTL_MINUTES` — possible CSRF attempt or an expired/stale link. |
| `INVITE_EMAIL_MISMATCH` | `invite`-intent callback's IdP email didn't match the invited email — see [`GET /v1/auth/invite/:token/microsoft`](#get-v1authinvitetokenmicrosoft). |
| `PROVIDER_ERROR` | The IdP itself returned an error (user declined consent, provider outage, etc). |

## Security considerations

- **Token storage** — `password_reset_tokens.token_hash` and `platform_admin_invites.token_hash`
  store a hash of the token, never the raw value (mirrors how `password_hash` is never the raw
  password). The raw token exists only in the emailed link and the client's request — a database
  read (backup, replica lag snapshot, insider access) can't be used to mint valid tokens.
- **No user enumeration** — [`POST /v1/auth/forgot-password`](#post-v1authforgot-password) returns
  the same `200` and message whether or not the email exists, and does the same DB work either way
  (a dummy hash comparison on the not-found path) so response timing doesn't leak the answer
  either. [`GET /v1/auth/invite/:token`](#get-v1authinvitetoken) and the token-consuming endpoints
  return the same `INVALID_OR_EXPIRED_TOKEN` for "never existed," "already used," and "expired" —
  distinguishing them would tell an attacker which guesses are "close."
- **Generic login failure message** — [`POST /v1/auth/login`](#post-v1authlogin)'s
  `INVALID_CREDENTIALS` covers wrong-password, unknown-email, and right-email-but-SSO-only with
  one message, for the same reason.
- **Password complexity** — enforced by `class-validator` at the DTO layer (`RegisterDto`,
  `ResetPasswordDto`, `ChangePasswordDto` today; the new `SignupDto`/`InviteAcceptDto` reuse the
  same regex): 8–128 chars, at least one upper, one lower, one digit, one special character.
  Hashing algorithm/cost factor is out of this document's scope — see `auth.service.ts`'s hashing
  utility, not duplicated here to avoid the two drifting apart.
- **Token lifetimes** — access tokens are short (15 min) specifically so a leaked access token
  (browser XSS, log accident) has a small blast-radius window; refresh tokens are long-lived but
  rotate on every use and are revoked wholesale on logout or password reset. See
  [Configuration](#configuration) for the env vars and the flagged `refresh_tokens` table
  prerequisite.
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
  a `password_reset_tokens`/`platform_admin_invites` row (`verify-email`, `reset-password`,
  `invite/accept`, the `invite` branch of the OAuth callback) does so via `UPDATE ... SET
  used_at = now() WHERE id = ? AND used_at IS NULL`, not a `SELECT` followed by a separate
  `UPDATE`. Two tabs submitting the same link at once make the second call see zero rows affected
  and fail as already-used, rather than both succeeding. See `PLAN.md` §8.7.
- **Refresh-token rotation has a deliberate reuse grace window, not strict single-use** — see
  [`POST /v1/auth/refresh`](#post-v1authrefresh) and `PLAN.md` §8.19: strict single-use rotation
  would log a legitimate double-tab user out everywhere on an ordinary race, which is worse than
  the small window it would otherwise close.
- **Tenant suspension is not instant for a token already in a user's hand** — access tokens are
  signature-only stateless JWTs; suspending a tenant blocks new logins/refreshes immediately but
  not a request riding an access token issued before the suspension, for up to its remaining
  15-minute lifetime. Accepted, not fixed — see `PLAN.md` §8.20 for the tradeoff.
- **Tenant/type confusion is the highest-severity mistake available in this module** — see the
  `type` claim discussion in [Session / token model](#session--token-model-1). A guard or
  repository method that trusts `tenantId` without checking `type === 'tenant_user'` first would
  let a platform-admin token pass a tenant-scoping check with `tenantId: undefined`, and depending
  on how the SQL is built, `WHERE tenant_id = $1` with `$1 = undefined` can behave very differently
  from "match nothing" depending on the query builder — verify this explicitly in tests, don't
  assume.
- **Directory restriction (`tenant_identity_providers`) is opt-in, not default** — most tenants
  (including this engagement's client) have no row
  here and accept any Microsoft account. Only set one up when the client explicitly wants "our
  Entra directory only," per the overview's [Frontend/backend
  boundary](./overview.md#frontend--backend-boundary).
- **Single-session logout is not offered** — [`POST
  /v1/auth/logout`](#post-v1authlogout) revokes every refresh token for the user, all devices at
  once. Acceptable for this engagement's single-user-per-tenant scope; revisit if multi-device
  "sign out of other sessions only" becomes a real requirement, since it needs the
  `refresh_tokens` table to carry a device/session identifier, not just a hash.
