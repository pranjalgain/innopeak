---
sidebar_position: 1
---

# Auth Module

## Overview

The auth module authenticates two independent kinds of principals against the InnoPeak schema
(`apps/backend/src/db/drizzle/migrations/` — split module-wise across `0000_foundation.sql`
through `0006_prompts.sql`; the auth-relevant tables live in `0001_platform_admin.sql` and
`0002_tenant_auth.sql`):

- **Tenant users** (`users` table) — the owner and, later, members of a single business tenant.
  Scoped by `tenant_id` on every table they touch.
- **Platform admins** (`platform_admins` table) — GeekyAnts-side support/ops staff with
  cross-tenant access. Modeled as a fully separate hierarchy (own identities table, own invite
  table, own status enum) so a `users` query never has to defensively handle a nullable-tenant
  "super user" row mixed in.

The module must support **all three kinds of login the schema models** — SSO (Microsoft Entra
ID), password, and social auth (Google) — at the API level. Which of those are actually exposed
is a **frontend decision**, not a backend one: **for MVP, this client engagement's UI only
renders a "Continue with Microsoft" button** (see `apps/documentation/docs/frontend/overview.md`
and the published design) — SSO is the only login method a user of this engagement ever sees. The
backend does not hardcode that restriction, though: password and social auth stay fully
implemented and live at the API level, so a future tenant, or this one later, can be handed either
without a schema or API change — see [Supported login methods](#supported-login-methods) and
[Frontend / backend boundary](#frontend--backend-boundary).

This document covers the module's architecture, data model, and request pipeline. For the
endpoint-by-endpoint contract — every route's request/response shape, error codes, and the OAuth
`state`-signing mechanics that thread signup/login/invite-acceptance through one callback per
provider — see [Auth Module — API Reference](./api-reference.md).

## Data model

| Table | Purpose |
|---|---|
| `tenants` | One row per customer business. `status`: `pending_activation` \| `active` \| `suspended`. |
| `tenant_identity_providers` | Which external directory (`entra_id`, `google_workspace`) a tenant trusts for SSO, and that directory's `provider_tenant_id`. Must be **configurable before** any user has logged in, so a first successful SSO login can't silently claim the directory for the tenant (`PLAN.md` §2). |
| `users` | Tenant-scoped user. `role`: `owner` \| `member`. `status`: `pending_verification` \| `invited` \| `active` \| `disabled`. `password_hash` is nullable — an SSO-only user has no password. `email` is stored **normalized** (trimmed, lowercased) — the unique index on `(tenant_id, email)` is case-sensitive, so normalization happens in code on every write and comparison; see [Email normalization](./api-reference.md#email-normalization). |
| `user_identities` | One row per (user, external provider). `provider`: `entra_id` \| `google`. Unique on `(provider, provider_user_id)` so the same external account can't attach to two app users. |
| `password_reset_tokens` | One-time tokens for the password path, keyed by `purpose`: `verify_email` \| `invite` \| `reset`. Despite the name it also carries invite and email-verification tokens — see [Auth flows](#auth-flows). |
| `platform_admins` | Mirrors `users` for the platform-admin hierarchy. `invited_by_platform_admin_id` nullable, with a unique partial index enforcing **at most** one root admin (`idx_platform_admins_single_root`) — zero rows satisfies it too, which is why the root admin has to be seeded. |
| `platform_admin_identities` | Mirrors `user_identities` for platform admins. |
| `platform_admin_invites` | Mirrors `password_reset_tokens` for platform admins, same `purpose` values minus `verify_email`. |

Two enums drive provider selection and must not be confused with each other:

- `user_identity_provider` (`entra_id`, `google`) — **login** identity, on `user_identities` and
  `platform_admin_identities`.
- `review_provider` (`google`) — where **review data** comes from, on
  `review_provider_connections` and `locations`. A tenant signing in with Microsoft still connects
  Google Business Profile for reviews — the two are intentionally decoupled.

## Supported login methods

Three kinds of login, not two — **SSO** and **social auth** are easy to conflate since both are
OAuth redirects through an external identity provider, but they're kept as distinct categories in
this document on purpose (see the note below the table for why):

| Kind | Method | Schema support | Status in this codebase |
|---|---|---|---|
| **SSO** | Microsoft (Entra ID) | `user_identity_provider.entra_id`, `tenant_identity_provider.entra_id` | **Tenant sign-in and sign-up implemented** (see [Microsoft sign-in](./microsoft-login-design.md)); directory-checked tenant IdPs, admin sign-in and member invites with Microsoft are not (see [Frontend / backend boundary](#frontend--backend-boundary)) |
| **Password** | Email + password | `users.password_hash`, `password_reset_tokens` | Implemented (generic boilerplate) — needs tenant-scoping, see [Gap](#gap-between-current-code-and-target-design) |
| **Social auth** | Google | `user_identity_provider.google` | Implemented (generic boilerplate), needs tenant-scoping |
| **Social auth** | GitHub / Apple | Not modeled in `user_identity_provider` | Present in current code as unrelated boilerplate leftovers; not part of this product's scope — would slot in alongside Google if a future engagement wants them |

**SSO and social auth share one mechanism, split by whether a `tenant_identity_providers` row
exists, not by provider or code path**: both create a `user_identities` row keyed by `(provider,
provider_user_id)` (see [Data model](#data-model) above) via the exact same
OAuth-redirect-then-callback flow. The callback additionally checks `tenant_identity_providers`
before issuing tokens whenever a tenant has one configured for that provider — proving the login
came from *this tenant's* trusted directory, not just *some* account with that provider — and
skips straight to "prove you control this email address," the same bar the password path clears,
when it doesn't. For this engagement that split lines up with Microsoft = SSO (directory-checked)
vs. Google = social auth (no directory check), but it isn't provider-fixed: `google_workspace` is
already a valid `tenant_identity_provider` value (see [Data model](#data-model)), so
a tenant that configures one turns its own Google logins into directory-checked SSO too — "SSO"
here describes a *policy a tenant opts into per provider*, not an intrinsic property of Google vs.
Microsoft.

One citation caveat: enforcing that check at login is an **extension of** `PLAN.md` §2, not
something §2 asks for. §2 explicitly parks the table — *"`tenant_identity_providers` … stays
unused even with member SSO in the picture … it doesn't yet"* — and §4.3b confirms nothing in the
member-invite path checks which directory a login came from. Treat directory enforcement as
opt-in behaviour this document adds on top of §2, to be confirmed with the client (it's the open
question §2 names: "anyone in Acme Corp's Entra directory can sign in without an individual
invite").

## Global request pipeline

Order matters here — each stage can short-circuit the request before it reaches the next one.

### Middleware (`AppModule.configure`, applied in `apps/backend/src/app.module.ts`)

Run in registration order, before any guard:

1. `DevToolsMiddleware` — scoped to `admin/queues` (Bull Board) only; the request-metrics middleware and the dev-tools pages are gone.

**`CookieAuthMiddleware` has been deleted**, along with its registration here — it read cookie
names (`sid` / `refresh_token` / `temp_sid`, or `admin_*` variants) this app's auth system never
actually used, and depended on `cookie-parser`, which wasn't registered when it ran, so it was
inert on every request from the day it was written. The real mechanism — a browser session and a
raw bearer-token API client hitting the same Passport JWT strategy — is `JwtStrategy`'s own
extractor chain (`ExtractJwt.fromExtractors([fromAccessTokenCookie, ExtractJwt
.fromAuthHeaderAsBearerToken()])`), backed by `cookie-parser` now genuinely registered in
`bootstrap.ts`. See the [Session / token model](#session--token-model) section below, which
already described this correctly.

### Guards (global `APP_GUARD` providers, `apps/backend/src/app.module.ts`)

Execute in this fixed order for every request, each must pass:

1. **`ThrottlerGuard`** — rate limiting, see [Rate limiting](#rate-limiting-throttler) below.
2. **`JwtAuthGuard`** — validates the bearer token via the `jwt` Passport strategy. Skipped
   entirely on routes annotated `@Public()`.
3. **`RolesGuard`** — OR logic. Reads `@Roles(...)` metadata off the handler/class; if none is
   set, passes automatically. Otherwise the authenticated user needs at least one matching role.

`RolesGuard` reads `user.role: string` off the request — a single value, matching `users.role`'s
`user_role` enum (`owner` \| `member`) directly, not the boilerplate's `roles: string[]`.
**`PermissionsGuard` is dropped, not adapted.** The generic boilerplate's separate
`roles`/`permissions`/`user_roles`/`role_permissions` tables have no equivalent anywhere in the
InnoPeak migrations, and none are needed: `PLAN.md` §2 defines the owner/member split as two fixed
access bundles — owner gets full tenant access (Settings, review approval), member gets review
workflow only — not a per-capability matrix that would call for one. A guard whose job is to check
`@Permissions(...)` metadata against data this product never asked for isn't a gap to close, it's
scope this module doesn't carry; see [Gap](#gap-between-current-code-and-target-design).

### Interceptors (global `APP_INTERCEPTOR` providers)

- `HttpLoggingInterceptor` — structured request/response logging.
- `TransformInterceptor` — wraps successful responses in the app's standard envelope.

### Decorators available inside the pipeline

- `@Public()` — bypasses `JwtAuthGuard` for that route.
- `@Roles(UserRole.OWNER, UserRole.MEMBER)` — OR match, enforced by `RolesGuard`. Takes `UserRole`
  members rather than string literals, so a typo is a compile error instead of a route nobody can
  reach. This is the only access-control decorator this module uses — see the guard-pipeline note
  above for why `@Permissions(...)` isn't part of the target design.
- `@CurrentUser()` — param decorator; extracts the authenticated user (or one field of it, e.g.
  `@CurrentUser('email')`) from `request.user`. Only valid on routes that pass `JwtAuthGuard`.

## Rate limiting (Throttler)

Four named tiers are registered globally (`ThrottlerModule.forRoot`,
`apps/backend/src/app.module.ts`). Because all four are *named* and none is the unnamed default,
`ThrottlerGuard` evaluates **all four on every route** — a `@Throttle({ short: ... })` override
replaces only the `short` entry and leaves the other three in force.

| Tier | Window | Configured `ttl` | Limit |
|---|---|---|---|
| `short` | 1 minute | `MINUTE_MS` (`60 * 1000`) | 30 requests |
| `medium` | 5 minutes | `5 * MINUTE_MS` | 100 requests |
| `long` | 30 minutes | `30 * MINUTE_MS` | 500 requests |
| `very-long` | 1 hour | `60 * MINUTE_MS` | 1000 requests |

> **Fixed.** These values were previously written in seconds (`ttl: 1 * 60` with a `// (1 minute)`
> comment) while `@nestjs/throttler` has taken `ttl` in **milliseconds** since v5 and this project
> pins `6.5.0` — a 60-*millisecond* window, which made the global tiers unenforceable
> (30 requests inside 60 ms is not a limit anyone reaches). `app.module.ts` now defines a
> `MINUTE_MS` constant and builds every tier from it, matching what the per-route auth overrides
> below already did correctly (they were the tell that minutes were intended all along).

Auth-specific overrides on top of the `short` window (`apps/backend/src/api/auth/auth.controller.ts`):

| Route | Limit |
|---|---|
| `POST /v1/auth/signup` | 5 / minute |
| `POST /v1/auth/verify-email` | 10 / minute |
| `POST /v1/auth/resend-verification-otp` | 5 / minute |
| `POST /v1/auth/login` | 10 / minute |
| `POST /v1/auth/refresh` | 20 / minute |
| `POST /v1/auth/change-password` | 5 / minute |
| `POST /v1/auth/set-password/request-otp` | 5 / minute |
| `POST /v1/auth/set-password` | 5 / minute |
| `GET /v1/auth/google` | 10 / minute |
| `GET /v1/auth/microsoft` | 10 / minute |
| `POST /v1/auth/sso/complete-signup` | 5 / minute |
| `POST /v1/auth/logout`, `GET /v1/auth/me`, `GET /v1/auth/google/callback`, `GET /v1/auth/microsoft/callback` | no override — falls back to the global `short` default (30 / minute) |

The login/register/change-password limits exist specifically to blunt credential-stuffing and
brute-force attempts against the password path — they matter less once Microsoft SSO is the only
path a given tenant can use, but they stay in place for the password and Google paths, which
remain live at the API level.

Two things about them worth knowing before relying on them. They are keyed **per client IP**
(the throttler's default tracker), so behind the load balancer `trust proxy` has to be configured
or every user shares one bucket. And per-IP is the wrong axis for credential stuffing, which
arrives from many addresses at one account — so the password login routes also keep a
**per-email failure counter in Redis** that locks an email out after `LOGIN_LOCKOUT_THRESHOLD`
failures in `LOGIN_LOCKOUT_WINDOW_MINUTES`, returning the same `INVALID_CREDENTIALS` as a wrong
password so the lockout itself can't be used to enumerate accounts. Contract and rationale in [the
API reference](./api-reference.md#brute-force-protection-throttling-and-per-account-lockout).

## API surface

All routes are versioned under `/v1/auth` (`RouteNames.AUTH`, `version: '1'` in
`@Controller()`). This is the **current** surface — see [Gap](#gap-between-current-code-and-target-design)
for what needs to change before it matches the InnoPeak tenant model.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/v1/auth/signup` | `@Public()` | Creates tenant + owner, emails a 6-digit OTP. |
| `POST` | `/v1/auth/verify-email` | `@Public()` | Consumes the OTP, activates the account, issues the first token pair. |
| `POST` | `/v1/auth/resend-verification-otp` | `@Public()` | Re-sends a code, subject to a per-email cooldown. Uniform acknowledgement either way. |
| `POST` | `/v1/auth/login` | `@Public()` | Password login. Per-email lockout on top of the per-IP throttle. |
| `POST` | `/v1/auth/refresh` | `@Public()` | Rotates the pair, authority from the `refresh_token` cookie. |
| `POST` | `/v1/auth/logout` | `@Public()` | Authority from the `refresh_token` cookie, **not** a bearer token — see the API reference for why. Revokes all refresh tokens for that user. |
| `GET` | `/v1/auth/me` | Bearer | The authoritative "who is signed in", read from the DB. |
| `POST` | `/v1/auth/change-password` | Bearer | Requires the current password; a wrong one counts against the same per-account sign-in budget as `login` (a locked account is answered like a wrong password), and the budget clears on success. Issues a fresh token pair and revokes every other session. |
| `POST` | `/v1/auth/set-password/request-otp` | Bearer | Mails the step-up code `set-password` requires. Uniform acknowledgement whether or not a fresh code went out (per-email cooldown). |
| `POST` | `/v1/auth/set-password` | Bearer | For an account that has never had one (Google-only). Takes `otp` from the route above — an access token alone is not proof enough to grant a permanent credential. |
| `GET` | `/v1/auth/google` | `@Public()` | Redirects into Google's consent screen. Bare OIDC over `fetch`, not a passport strategy. |
| `GET` | `/v1/auth/google/callback` | `@Public()` | Google callback; every outcome is a `302`. |
| `GET` | `/v1/auth/microsoft` | `@Public()` | Redirects into Microsoft's (Entra ID) sign-in. `?intent=login\|signup`; state is signed, single-use and carries a PKCE verifier and OIDC nonce. Design: [Microsoft sign-in](./microsoft-login-design.md). |
| `GET` | `/v1/auth/microsoft/callback` | `@Public()` | Microsoft callback; verifies the ID token, then every outcome is a `302`. Tenant users only. |
| `POST` | `/v1/auth/sso/complete-signup` | `@Public()` | Supplies the business name an SSO provider (Google or Microsoft) cannot, against the `sso_pending_signup` cookie. |

> **Not implemented, despite appearing in earlier drafts of this document:** `/v1/auth/register`
> (superseded by `signup`), `/v1/auth/github*`, `/v1/auth/mfa/*`, and
> `/v1/auth/forgot-password` + `/v1/auth/reset-password`. The last pair matters most: there is
> **no password-recovery path today**. The corresponding `RouteNames` members have been removed so
> a dead name cannot be mistaken for a live route.

Not yet present, needed for the target design:

- Microsoft SSO for platform admins and member invites (tenant sign-in/sign-up exists — see
  [Microsoft sign-in](./microsoft-login-design.md)).
- `POST /v1/auth/signup` (or equivalent) — tenant self-registration: creates the `tenants` row,
  the `owner` `users` row, and (for the password path) a `verify_email` token; for the SSO path,
  creates the `user_identities` row directly since Entra/Google already verified the email.
- `POST /v1/auth/invite` / `POST /v1/auth/invite/accept` — member invite flow backed by
  `password_reset_tokens` with `purpose = 'invite'`.
- `POST /v1/auth/forgot-password` + `POST /v1/auth/reset-password` — `purpose = 'reset'` tokens.
  DTOs for these already exist (`forgot-password.dto.ts`, `reset-password.dto.ts`,
  `verify-email.dto.ts`) but aren't wired to controller routes yet.
- A parallel, separate set of routes (or a distinct `platform-admin` controller) for platform
  admin login/invite, since `platform_admins` is intentionally not the same table as `users`.

This list is a quick summary, not the source of truth — see [Auth Module — API
Reference](./api-reference.md#tenant-user-api) for the full, target route list (including the
invite-acceptance-via-SSO routes and the unified per-provider OAuth callback design) and every
request/response contract.

## Auth flows

Mapped to the schema tables above, independent of which login method is used:

1. **Tenant self-registration (owner)** — create `tenants` (`status = 'pending_activation'`),
   create `users` (`role = 'owner'`, `status` depends on method: `pending_verification` for
   password, `active` for SSO since the provider already verified the email), create
   `user_identities` for the SSO case. `businessName` is collected directly from the owner at
   signup, for both password and SSO — it names `tenants.name`, the tenant/company identity,
   which is a genuinely different thing from `locations.name` (the per-location name synced
   later from a connected Google Business Profile). One tenant can have several `locations` rows
   (a business with multiple branches), so the tenant name can't be *derived from* a location
   connection the way an earlier draft of this flow assumed — that conflated "the tenant's name"
   with "this one location's name," which only holds if a tenant never has more than one
   location. The connect step (`apps/documentation/docs/frontend/overview.md`) only ever
   populates `locations.name` per connected location; it never touches `tenants.name`.
2. **Login** — password path checks `users.password_hash` (subject to the per-email lockout
   counter, see [Rate limiting](#rate-limiting-throttler)); SSO path looks up
   `user_identities(provider, provider_user_id)` and, if `tenant_identity_providers` has an active
   row for that tenant + provider, must also confirm the SSO directory matches
   `provider_tenant_id` before issuing tokens. **That directory check is a property of the tenant,
   not of this flow** — it applies identically to flow 3's SSO acceptance and to flow 1's
   returning-user case, or a tenant's "our directory only" policy has a side door. See the shared
   rule in [the API reference](./api-reference.md#get-v1authmicrosoftcallback).
3. **Member invite** — owner creates a `password_reset_tokens` row with `purpose = 'invite'` tied
   to a pending `users` row (`status = 'invited'`); invitee accepts via token, then either sets a
   password or completes SSO (directory-checked if the tenant has a policy, and the IdP email must
   match the invited email — compared on normalized values, see [Email
   normalization](./api-reference.md#email-normalization)), which flips `status` to `active`.
4. **Password reset** — `password_reset_tokens` with `purpose = 'reset'`, single-use
   (`used_at`), time-boxed (`expires_at`).
5. **Email verification** — `purpose = 'verify_email'`, password path only. SSO logins skip this
   entirely since the identity provider already vouches for the email, which is why the
   Microsoft-only signup flow has no email-verification step to render at all.
5b. **Adding a password to an SSO-only account** — `purpose = 'set_password'`, single-use and
   time-boxed like the rest. Deliberately its own purpose rather than reusing `'reset'`: the two
   would share the one-row-per-`(user_id, purpose)` slot and silently invalidate each other, and a
   code minted behind a bearer token would satisfy a consume from the *public* reset route once
   that is built. See [`POST
   /v1/auth/set-password`](./api-reference.md#post-v1authset-password).
6. **Platform admin invite/login** — same shapes as 1–4 but against `platform_admins` /
   `platform_admin_identities` / `platform_admin_invites`, kept structurally separate per the note
   in [Data model](#data-model).

## Session / token model

- JWT access token, 15-minute expiry (`JwtModule.registerAsync`, `apps/backend/src/auth/auth.module.ts`).
- Refresh token with rotation on use (`POST /v1/auth/refresh`). **Refresh also re-checks
  `users.status` / `tenants.status` (or `platform_admins.status`) and revokes the family if the
  principal is disabled or the tenant suspended** — this, not the 15-minute access-token TTL on
  its own, is what makes `PLAN.md` §8.20's "suspension takes effect within one access-token
  lifetime" true. Refresh tokens are additionally revoked wholesale on logout, password reset, and
  password change (the last returns a fresh pair to the caller so only *other* sessions die).
- Access and refresh tokens are signed with separate secrets; `JWT_REFRESH_SECRET` may fall back to
  `JWT_SECRET` in non-production only, and the app must refuse to boot in production when they're
  missing or equal — see [Configuration](./api-reference.md#configuration).
- Both travel as HttpOnly cookies (`access_token`, path `/`; `refresh_token`, path `/v1/auth`),
  and the access token is *additionally* returned in the JSON body so a non-cookie client can send
  it as a `Bearer` header. `JwtStrategy` reads the cookie first, then the header. The former
  `CookieAuthMiddleware`, which promoted `sid`/`admin_sid` cookies into the `Authorization` header,
  has been **deleted** — it was registered on every route, referenced cookie names nothing in this
  product sets, and would have promoted a `refresh_token` cookie into a bearer header. Historical
  caveats that no longer apply: cookie promotion is inert until
  `cookie-parser` is registered (see [Global request pipeline](#global-request-pipeline)), and the
  `admin_*` variants are selected purely by *the path containing `dev-tools`* — there is a `TODO`
  in `cookies.middleware.ts` where real platform-admin detection belongs, so this needs extending
  before the platform-admin surface can use cookies at all.

  > **This bullet, and the "inert until `cookie-parser` is registered" claim above, are stale —
  > verified against current code, not assumed.** `cookie-parser` **is** registered:
  > `app.use(cookieParser())` in `apps/backend/src/bootstrap.ts:51`. `CookieAuthMiddleware` itself
  > (`src/middlewares/cookies.middleware.ts`) still exists and still reads `sid`/`refresh_token`/
  > `temp_sid`, but that isn't the cookie scheme the real login/refresh flow actually issues or
  > reads today — see the box below for what's actually in use. Whether this middleware is even
  > wired into `AppModule.configure()` any more, and whether `sid`/`temp_sid` are dead cookie
  > names from an earlier design, wasn't chased down as part of this note; flagging it rather than
  > asserting either way.

  > **The web app's real session cookies, as actually implemented — not what the bullets above
  > describe.** `AuthController` (`src/api/auth/auth.controller.ts`) sets three cookies together
  > on every token-issuing route (`setSessionCookies`): `access_token` (`Path=/`, 15 min),
  > `refresh_token` (`Path=/v1/auth`, 7 days), and `session` — no credential, just a `"1"` flag,
  > same `maxAge` as the refresh token, that only exists so the frontend's edge middleware
  > (`apps/web/src/proxy.ts`) can route a visitor to `/login` vs. `/dashboard` before any client JS
  > runs, without being fooled by the access token's 15-minute expiry into bouncing a
  > still-refreshable, idle visitor. `POST /v1/auth/refresh` reads `refresh_token` directly via
  > `req.cookies` (populated by the `cookie-parser` above) — not through `CookieAuthMiddleware`'s
  > `Authorization`-header promotion.
  >
  > **`clearSessionCookies` runs on every path that fails to rotate *except a lost rotation
  > race*.** `TokenService.rotate` throws `RefreshTokenSupersededException` (a subclass of
  > `UnauthorizedException`, same 401, same message, so no new enumeration signal) when the
  > presented token is inactive *but the user still holds a live one* — i.e. a concurrent refresh
  > already minted the successor and the browser is holding it. `hasActiveRefreshToken(userId)`
  > is what separates that from a genuinely dead family; the lost-CAS path is superseded by
  > definition and skips the query. Clearing cookies there would discard the winner's valid
  > session and log the user out of every open tab — two idle dashboard tabs waking together hit
  > this, because the frontend's single-flight refresh is per-tab, not per-browser. Otherwise: — an unknown/revoked/reused
  > refresh token, a missing cookie, a disabled user, a suspended tenant, or (functionally
  > identical to a revoked token) a `refresh_tokens` row a dev DB reset removed out from under a
  > still-cookied browser — clearing all three before the 401 propagates, not just leaving the two
  > real tokens stale. Without it, `session` outlives a definitively dead refresh token (its own
  > 7-day `maxAge` never got touched by the failure), so the edge middleware keeps routing the
  > visitor to `/dashboard`, the client re-attempts the same dead refresh, and the two sides bounce
  > forever — `POST /v1/auth/refresh` firing on every bounce until `@Throttle` starts rejecting it
  > outright. `auth.controller.spec.ts` covers all four branches (rejected token clears and sets
  > nothing; missing cookie clears without calling the service; a non-auth error — a `ThrottlerException`,
  > a DB blip — clears nothing, since neither means the session is actually dead; a successful
  > rotation sets fresh cookies without clearing first).
- `JwtPayload` currently carries `sub`, `email`, `roles: string[]`, `permissions: string[]` — needs
  to become `sub`, `tenant_id`, `email`, `role` (singular, matching the `user_role` enum, and with
  no `permissions` claim at all — see the guard-pipeline note above) for the tenant-user path, plus
  an equivalent shape for the platform-admin path that has no `tenant_id` at all.

## Session hardening (security audit)

Fixes from the auth and session audit, each described where it applies.

- **Re-signing an access token never extends it.** `POST /v1/auth/update-locale` re-signs the access token so the new `locale`
  claim applies at once. It signs to the *presenting token's remaining lifetime* (`sessionExpiresAt`, from its `exp`; capped at the
  full TTL and floored at one second), exactly as the platform-admin version always did. A fresh TTL on every call would let anyone
  holding a stolen access token renew it indefinitely (10 calls a minute) through a logout and a password change, neither of which can
  reach an access token. The refresh token is still never minted from an access token.
- **Bull Board (`/admin/queues`) reads the admin cookie.** The ops-tools guard (raw Express middleware in `bootstrap.ts`) takes
  the platform admin's `admin_access_token` cookie, then a Bearer header. It used to read the tenant `access_token` cookie, which
  a platform admin's browser does not carry, so admins were told to authenticate. A tenant session is never a credential here.
- **Passwords: a 72-byte cap on new ones, a 128-character cap on checked ones.** bcrypt reads only the first 72 *bytes* and ignores the
  rest, so two different long passwords sharing their first 72 bytes would verify against each other. New passwords (sign-up, change,
  set, both invite accepts, both admin password routes) are refused beyond 72 UTF-8 bytes (`MaxByteLength`; an accented character is two),
  and the web schemas count bytes the same way. A password being *checked* (login, restore account, delete account) allows up to 128
  characters, so an older password longer than 72 bytes still signs in (it was truncated the same way when it was set), and a request
  can no longer carry a megabyte-long one into bcrypt.
- **The OAuth `state` is signed with its own key.** `GOOGLE_AUTH_STATE_SECRET` (required in production, at least 32 characters when set), else a
  key *derived* from `JWT_SECRET` by HMAC-ing a fixed label, so the state signature never uses the same bytes as the access tokens. With
  neither set the service refuses to start; it no longer falls back to a constant readable in the source. A state minted before a deploy
  of this change stops verifying (the 10-minute window), so someone mid-sign-in has to click the button again.
- **Google sign-in uses PKCE, like Microsoft.** Every Google sign-in start (tenant login and sign-up, member invite, admin invite, admin login)
  mints its state with a verifier held only in the Redis record; only the S256 challenge goes to Google, and the code is redeemed with the
  verifier, so a code injected into another browser's callback cannot be exchanged. A state minted before this shipped carries no
  verifier and no challenge went out for it, so it is redeemed without one (it expires within 10 minutes). There is no OIDC `nonce` to
  add: the identity is read from the userinfo endpoint with the access token from the server-side code exchange, not from an ID token.
  The separate Google *Business Profile connect* flow (review data, its own client) is not covered here.
- **An access token can be ended early.** A JWT cannot be taken back, so a logout, a password change, a disabled user or a suspended
  business used to leave every access token already issued working until it expired (up to 15 minutes). `SessionRevocationService`
  writes a "not before" mark to Redis (`auth:sessions-revoked-after:user:<id>` or `…:tenant:<id>`, a second-resolution epoch, expiring after
  the longest an access token can live) and `JwtStrategy` refuses a tenant token issued before it: one `MGET` per tenant request.
  Marks are written by `TokenService.revokeAll` (logout, refresh-token reuse, a disabled user or suspended business seen at refresh), a password
  change or set (sparing tokens issued in that very second, since the caller's fresh pair follows), a self-service or admin erasure request and an
  admin suspension (the whole business), an admin deactivating a user, and an owner removing a member. It is best-effort and **fails open**: Redis is
  already a hard dependency, the refresh path enforces the same standing within one access-token lifetime, and an outage must not fail every request.
  A mark covers the current second too, so signing in again within the same second as a logout hands back a token that is refused once; the
  client's normal refresh recovers. Platform-admin tokens are re-checked against the database on every request (a disabled admin loses access at once) and
  now against the user mark as well, so the next item applies to them too.
- **A platform admin's logout and password change end their access tokens.** An admin has no refresh token, so a logout only cleared the
  browser's cookies and a copied `admin_access_token` kept working until it expired, and so did every older token after a password change or a
  first password being set. `POST /v1/auth/logout` (public, authority from the cookies) now also verifies any access token it is given (the
  tenant or admin cookie, or a Bearer header): an admin token writes the user mark, a tenant token also revokes that user's refresh tokens, and a
  token that does not verify is ignored silently. `POST /v1/admin/settings/profile/change-password` and `…/set-password` write the mark
  (sparing the current second), then sign a fresh access token to the presenting token's remaining lifetime (so neither route extends a session)
  and set it as the `admin_access_token` cookie; the JSON body is unchanged. `JwtStrategy` checks only the user mark for an admin
  (`isRevoked` takes no tenant).
- **A sent email no longer leaves its credential in Redis.** A job's payload carries the raw OTP or invite link (an invite link is valid for days),
  and the email queue keeps completed jobs for a day for Bull Board. Logs and the dead-letter copy were already redacted
  (`redactJobSecrets`); now `EmailProcessor` also redacts the *stored* payload (`otp`, `inviteLink`, `passwordResetLink`, `passwordSetLink`
  become `[redacted]`) once the job completes, and once its last attempt has failed (after the dead-letter copy is taken). Earlier attempts
  leave it intact, since a retry must send the real code. A failed scrub is logged and ignored. A job BullMQ fails for stalling past `maxStalledCount` emits only `stalled`, never `failed`, so `onStalled` looks the job up and retires it the same way when it really is failed (a merely re-queued one is left alone). A job whose payload was redacted cannot be
  replayed from Bull Board; request a new code or invite instead. The SQS transport keeps nothing after the message is deleted.
- **No form bodies, so no login CSRF.** The API parses JSON only (the global `urlencoded` parser is gone; nothing inbound takes a form: OAuth
  callbacks are GETs). A form can be auto-submitted from any site with no preflight and no `Origin` check, and the `Set-Cookie` on a
  public route such as `/v1/auth/login` would replace the victim's session with the attacker's. A JSON request needs a CORS preflight, which a
  foreign origin fails. The cookies are `SameSite=Lax`, which already stopped *authenticated* CSRF but not this.
- **Bull Board honours revocation too.** The ops-tools guard (`createOpsToolsGuard`, raw Express middleware) now calls
  `SessionRevocationService.isRevoked` after the admin-status check, so an admin who logged out or changed their password no longer keeps
  `/admin/queues` (whose job payloads carry OTPs and invite links) open for the rest of the token's 15 minutes. It fails open on a Redis
  outage, like `JwtStrategy`.
- **A failed database statement is logged without its SQL.** `DrizzleQueryError.message` is `Failed query: <sql>\nparams: <every bound value>`, and its
  stack starts with it, so the exception filter and the unhandled-error path were writing password and token hashes, emails and review text
  into the logs (and Loki). `toLoggableError` reduces it to the SQLSTATE, constraint, table and column (never the driver's `detail`, which quotes
  the row) and keeps the stack frames.
- **Developer conveniences are tied to a local setup, not `NODE_ENV` alone.** Swagger, the database detail and raw error messages in API
  responses, and Bull Board's write actions are on only when `isLocalDevelopment()` (not production *and* a local `FRONTEND_URL`). A staging box
  also runs as `development`; it now answers like production.
- **OTP budgets are scoped by flow, and by principal where there is one.** The attempt budget (10 per 10 minutes) and the resend cooldown were keyed
  on one hash per address, shared by every flow. An anonymous caller guessing at the *public* sign-up code could therefore spend the owner's
  budget and lock them out of their own set-password and delete-account codes, and an admin's. They are now
  `auth:otp-attempts|otp-resend:<scope>:<sha256(identity)>` (`OtpScope`): the public verify-email flow is keyed on the submitted email (so an
  unknown address still counts, no existence oracle) and the signed-in flows (`set-password`, `delete-account`, `admin-set-password`) on the user
  or admin id, which nobody outside can spend. Redis keys written before this change simply expire.
- **A code or invite the queue refused is no longer reported as sent.** Every email send was fire-and-forget with a silent `catch`, so the
  API answered success, the resend cooldown (claimed *before* sending) stayed spent, and an invite row existed for an address nobody had mailed.
  Now the enqueue is awaited and its result acted on. A *signed-in* code request (tenant set-password, delete-account, admin set-password)
  releases the cooldown (`OtpAttemptService.releaseResend`) and answers `503 EMAIL_QUEUE_UNAVAILABLE` (en/de): nothing was changed, retry now. A
  *public* resend (`issueOtp`) releases the cooldown but keeps its identical answer, so it still reveals nothing about which addresses exist.
  Signup is unchanged (no cooldown is claimed, so another code can be requested at once). An admin or member **invite** that cannot be queued is
  taken back (`revokeInvite` / `revokeMemberInvite`) before answering 503, and the admin activity entry is written only after the mail is queued, so
  the address is not left reading "already invited".
- **A route with no `@Roles()` is a tenant route.** `RolesGuard` used to let *any* authenticated principal through when no role was listed, so a
  tenant route that forgot its `requireTenantUser` check was reachable by a platform-admin token, and an admin route that forgot its
  `@Roles(PLATFORM_ADMIN)` by any tenant user. A `@Public()` route is let through unchecked; a route with no role now admits tenant users only.
  The other half (an admin route missing its role) cannot be seen by the guard, so `route-guards.spec.ts` reads the real decorators off every
  controller and requires `PLATFORM_ADMIN` on every non-public route under `admin/`, and that every `PLATFORM_ADMIN` route lives there (the
  access-token cookie is chosen by URL). Adding a route with a missing role fails that spec, naming the route.
- **A password sign-up can only be finished by the browser that made it.** Verification used to need only the email and the 6-digit code, and
  the password was already set, so someone who signed up with *another person's* email first held that address, and (if the code later reached
  the real owner and was passed on) the account kept the squatter's password. Now `POST /v1/auth/signup`, and `POST /v1/auth/login` for a
  still-unverified account, set an httpOnly `signup_binding` cookie (path `/v1/auth`, 24 h): an HMAC, under a key derived from `JWT_SECRET`, of the
  user id and the stored password hash. `POST /v1/auth/verify-email` for an unverified account refuses anyone who does not present a matching cookie,
  with the same `InvalidOtpException` as a wrong code (so it is not an oracle), and clears the cookie on success. Nothing is stored for it; changing
  the password hash voids it. The cookie is same-origin and httpOnly, so the web app needs no change. Someone who signs up on one device and
  opens the code on another logs in on the second device with the password (that sets a cookie there) and then enters the code.
- **A squatted sign-up is replaced, then purged.** An unverified sign-up (a `pending_activation` business whose only user is its
  `pending_verification` owner) older than 24 hours no longer blocks the email: the next password sign-up for it removes that business and
  creates the new one in the same transaction, so a squatter cannot hold an address for good. Anything younger, any verified account, and any
  business with another user in it is never touched. The nightly purge also deletes such sign-ups after 7 days, and logs the count.

  `revokeAll` writes the mark *before* revoking the refresh rows, and `TokenService.rotate` re-checks the mark once its successor is committed: a refresh that races a logout (its rotation commits where the logout's `UPDATE` cannot see it) revokes the successor and answers 401 instead of leaving a live session behind. A password change (and set-password) writes its mark before the revoking `UPDATE` too, and the rotation's re-check judges the mark against the `iat` of the refresh token being rotated (not the time of the rotation), exactly as an access token is judged, so the fresh pair a password change hands its caller can be refreshed a moment later without being mistaken for one that raced the change. The Redis calls behind the mark are bounded (500 ms), so an outage fails open instead of holding every request.

## Development conveniences are tied to where the app is reachable

`NODE_ENV` has two values, so a publicly reachable staging box running as `development` used to get every development convenience:
the fixed sign-up code `DEV_VERIFY_EMAIL_TOKEN` (anyone could verify any email), invite links written to the log, and session
cookies without `Secure`. They now also depend on `FRONTEND_URL`:

- `DEV_VERIFY_EMAIL_TOKEN` is refused at boot in production **and** whenever `FRONTEND_URL` is not a local address (`localhost`,
  `*.localhost`, loopback), and `AuthModule` only swaps in the fixed provider for a local setup (`isLocalDevelopment()`). An unset
  `FRONTEND_URL` counts as local (a bare dev machine).
- The `[dev]` invite-link log lines (admin and member invites) appear only for a local setup.
- Session and OAuth-binding cookies are `Secure` in production **and** wherever `FRONTEND_URL` is https (`shouldUseSecureCookies()`),
  and stay off for plain-http local development, where a `Secure` cookie would never be sent.

The shipped `.env.example` placeholders (`…-change-in-production`) are already refused at boot in production (`env-config.module.ts`).
A staging box that needs real email must run with `NODE_ENV=production` anyway: any other value uses the no-op email provider.

## Gap between current code and target design

`apps/backend/src/auth/` today is the **generic NestJS enterprise boilerplate's** auth module,
not yet adapted to this schema. It compiles and the tests pass, but it models a different product.
Before this module can be considered done for InnoPeak:

- **Done for tenant users:** Entra ID sign-in and sign-up (`/v1/auth/microsoft` +
  `/v1/auth/microsoft/callback`, `MICROSOFT_*` config) — bare OIDC over `fetch` with a hand-rolled,
  `crypto`-only ID-token verifier, not a Passport strategy. Still to do: directory-checked
  tenant IdPs, Microsoft for platform admins and for member invites. See
  [Microsoft sign-in](./microsoft-login-design.md).
- **Replace** `RolesGuard`'s `roles: string[]` model with the schema's single `user_role` enum
  (`owner` \| `member`). **Drop `PermissionsGuard`, `@Permissions()`, and the `permissions` JWT
  claim entirely — not adapt them.** There are no `roles`/`permissions`/`user_roles`/
  `role_permissions` tables anywhere in the migrations, and none are needed: `PLAN.md` §2 defines
  the owner/member split as two fixed bundles, not a per-capability matrix, so there's no
  requirement in this product a role-only check can't already express. Re-introduce a permissions
  layer only if a future requirement needs *asymmetric* grants within a role (e.g. some members
  can approve reviews and others can't) — until then it's unbuilt scope, not a gap.
- **Add tenant scoping** everywhere: `JwtPayload`/`AuthUser` need `tenant_id`; every query in
  `auth.repository.ts` needs a `tenant_id` filter, matching how every other table in the schema is
  tenant-scoped.
- **Split** the platform-admin path from the tenant-user path — right now there is exactly one
  `users`-shaped auth flow; `platform_admins` needs its own controller/service/guard path, not a
  role value bolted onto `users`.
- **Drop or explicitly defer** `GithubOAuthStrategy` and the Apple strategy files — neither
  provider exists in `user_identity_provider`, and keeping unused OAuth surface around is dead
  code, not forward-compatibility (unlike the `'google'` enum value, unused *by this engagement* but
  kept because a future *tenant* — not a future *codebase feature* — might use it).
- **Drop or explicitly defer** `MfaService` (and its two `mfa/setup`/`mfa/verify` routes) and
  `ApiKeyService` (`ApiKeyGuard` + `@ApiKeyAuth()` decorator only — it has no controller routes) — no
  `mfa_settings` or `api_keys` tables exist anywhere in the migrations. If MFA or API keys are wanted
  later, that's a new migration + new documentation, not a retrofit onto tables that don't exist.
- **Wire up** the still-unused password-reset DTOs (`forgot-password.dto.ts`,
  `reset-password.dto.ts`) to real controller routes per the flows above.
  `POST /v1/auth/change-password` (authenticated, current-password proof) and
  `verify-email` are implemented.

The gaps above are schema/business-logic gaps — this module modeling the wrong product. Separately,
the module also predates the project's current module-structure convention
(`apps/backend/docs/conventions/module-structure.md`, `apps/backend/CLAUDE.md`), which now applies
here too:

- **Move** the module from `src/auth/` to `src/api/auth/`, adding the `swagger/`, `constants/`,
  and `types/` subfolders the convention requires (`types/` replaces today's `interfaces/`).
- **Add** an `AuthDbService` (tenant-user path) and `PlatformAdminDbService` (platform-admin path)
  between each controller's service and `auth.repository.ts` — today `AuthService` calls the
  repository directly, the older three-layer shape this project no longer follows for new work.
  This is also where the multi-table transactions the [Auth flows](#auth-flows) above need (e.g.
  self-registration's `tenants` + `users` + `tenant_settings` + optionally `user_identities`
  insert) belong, rather than in `AuthService` itself.
- **Trim controllers to the minimal pattern**: bind params, call one service method, wrap the
  result with `ResponseUtil`, return it. Today's `auth.controller.ts` does inline response
  shaping and carries `@ApiOperation`/`@ApiResponse` directly on each route; both need to move —
  the latter into one `swagger/auth.swagger.ts` exporting one decorator-composing function per
  route. The platform-admin surface is a **separate module** (`src/api/platform-admin/`, with its
  own `controllers/`, `services/` and `swagger/` folders) rather than a second controller inside
  `src/api/auth/` — see [Platform Admin Module](../platform-admin/overview.md).
- **Route every user-facing string** (exception messages, custom success messages) through
  `src/common/constants/messages.constants.ts` (create it — it doesn't exist yet) instead of the
  inline literals currently thrown from `auth.controller.ts`/`auth.service.ts`.
- **Add an `example` to every DTO property** that's missing one, and an explicit return type to
  every method (controller, service, DB service, repository) currently left to inference.

Finally, four concrete defects this section originally listed as current — re-checked against
today's code rather than left standing on trust, since re-reading this whole "Gap" section while
documenting an unrelated fix (see the [Session / token model](#session--token-model) box above)
turned up enough drift to distrust the rest of it too. **Three of the four are resolved; one is
still real:**

- ~~`src/db/drizzle/schema.ts` is stale and describes a different database.~~ **Resolved.** It now
  exports 50 tables, including `reviews` (migration `0004`, well past the `0000`–`0006` this claim
  named) and `refreshTokens` — it has clearly been regenerated many times since this was written.
- ~~The `refresh_tokens` table does not exist in any migration.~~ **Resolved.** It's in
  `0007_auth_hardening.sql` (see `apps/backend/CLAUDE.md`'s migration table), and
  `schema.ts`/`token.repository.ts` both reflect it. Session / token model's rotation and
  logout-revocation description is accurate.
- ~~Global rate limiting is effectively off.~~ **Resolved.** `ThrottlerModule.forRoot`'s `ttl`
  values in `app.module.ts` are now genuine milliseconds (`MINUTE_MS = 60 * 1000` and multiples of
  it), matching what `@nestjs/throttler` 6.5.0 expects — the four tiers are the intended 1
  minute–1 hour windows, not the 60 ms–3.6 s ones a seconds-read-as-milliseconds bug produced. See
  [Rate limiting](#rate-limiting-throttler).
- ~~`cookie-parser` is neither installed nor registered.~~ **Resolved.** `app.use(cookieParser())`
  runs in `apps/backend/src/bootstrap.ts:51`. See the box above for what actually reads the
  resulting `req.cookies` today (`AuthController`'s own handlers, not `CookieAuthMiddleware`).

Given three of four were wrong, **the rest of this "Gap" section — the module-relocation,
tenant-scoping, Microsoft SSO, and platform-admin items above — was not re-verified here and
should not be trusted at face value either.** This appears to be a snapshot from early in the
module's build that was never revisited as work landed; a couple of spot checks done alongside
this note (the module already lives at `src/api/auth/`, not `src/auth/`, and
`src/common/constants/messages.constants.ts` already exists, both contradicting bullets above)
suggest most of it is similarly out of date. Worth a dedicated reconciliation pass against current
code rather than patching individual claims further as they're noticed.
- **The root platform admin is seeded, but cannot yet be logged into.**
  `src/db/seeds/seed-platform-admin.ts` (`pnpm db:seed:admin`) inserts the one row
  `idx_platform_admins_single_root` expects (a NULL inviter), which is the only way that identity
  can come into existence. It was a migration (`0008_dev_platform_admin.sql`, since removed) until
  that was found to commit the password in plain text. What is still missing is token issuance: `JwtStrategy`
  *validates* a `platform_admin` token, but neither `TokenService` nor `AuthService` mints one,
  and `/v1/auth/login` resolves through `users` only. So the row is in place for when the
  platform-admin auth routes land, and unusable until then.

## Frontend / backend boundary

**MVP scope, stated plainly: the frontend exposes SSO only — nothing else.** The Login and
OnboardingSignup screens render exactly one button, "Continue with Microsoft" (see
`apps/documentation/docs/frontend/overview.md`); there is no password form and no "Continue with
Google" button anywhere in the shipped UI for this engagement.

That restriction is a **frontend decision, not a backend one**. The backend must keep supporting
all three kinds — SSO, password, and social auth — at the API level: this is a genuinely
multi-tenant product, and a different tenant (or this one, later) may want password or Google
login without anyone touching the schema or the auth module's code. Nothing in the backend should
special-case "this tenant can only use Microsoft"; that's enforced (or not) entirely by which
buttons the frontend renders. The one place a real backend enforcement point exists is
`tenant_identity_providers`: if this client wants logins restricted to their own Entra directory
(not just "Microsoft" but "our Microsoft"), that's the row that encodes it, per the open question
already raised in the requirements list.
