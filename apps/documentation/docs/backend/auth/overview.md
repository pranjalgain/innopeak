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
| `users` | Tenant-scoped user. `role`: `owner` \| `member`. `status`: `pending_verification` \| `invited` \| `active` \| `disabled`. `password_hash` is nullable — an SSO-only user has no password. |
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
| **SSO** | Microsoft (Entra ID) | `user_identity_provider.entra_id`, `tenant_identity_provider.entra_id` | **Not implemented yet** — this is the only method exposed for MVP (see [Frontend / backend boundary](#frontend--backend-boundary)) |
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

1. `MetricsMiddleware` — all routes (`'*'`).
2. `CookieAuthMiddleware` — all routes (`'*'`). Reads `sid` / `refresh_token` / `temp_sid`
   cookies (or the `admin_*` variants when the path includes the dev-tools route) and, if no
   `Authorization` header is already present, promotes the cookie value into
   `Authorization: Bearer <token>`. The intent is that a browser session and a raw bearer-token
   API client hit the exact same Passport JWT strategy.
   **This is inert today**: `req.cookies` is only populated by `cookie-parser`, which is neither a
   dependency nor registered anywhere in the app, so the middleware always sees `undefined` and
   promotes nothing (the middleware's own source comments say as much). Every request therefore
   authenticates by `Authorization` header only until `cookie-parser` is wired up — see
   [Gap](#gap-between-current-code-and-target-design).
3. `DevToolsMiddleware` — scoped to `dev-tools`, `health/health-ui`, `admin/queues`, `api` only.

### Guards (global `APP_GUARD` providers, `apps/backend/src/app.module.ts`)

Execute in this fixed order for every request, each must pass:

1. **`ThrottlerGuard`** — rate limiting, see [Rate limiting](#rate-limiting-throttler) below.
2. **`JwtAuthGuard`** — validates the bearer token via the `jwt` Passport strategy. Skipped
   entirely on routes annotated `@Public()`.
3. **`RolesGuard`** — OR logic. Reads `@Roles(...)` metadata off the handler/class; if none is
   set, passes automatically. Otherwise the authenticated user needs at least one matching role.
4. **`PermissionsGuard`** — AND logic. Reads `@Permissions(...)` metadata; if none is set, passes
   automatically. Otherwise the user needs every listed permission.

`RolesGuard`/`PermissionsGuard` currently read `user.roles: string[]` and
`user.permissions: string[]` off the request — a shape carried over from the generic boilerplate's
separate `roles`/`permissions`/`user_roles`/`role_permissions` tables. **The InnoPeak schema has
none of those tables** — `users.role` is a single enum column. This guard pair needs adapting
before it's usable here; see [Gap](#gap-between-current-code-and-target-design).

### Interceptors (global `APP_INTERCEPTOR` providers)

- `HttpLoggingInterceptor` — structured request/response logging.
- `TransformInterceptor` — wraps successful responses in the app's standard envelope.

### Decorators available inside the pipeline

- `@Public()` — bypasses `JwtAuthGuard` for that route.
- `@Roles('owner', 'member')` — OR match, enforced by `RolesGuard`.
- `@Permissions('reviews:approve', 'settings:write')` — AND match, enforced by `PermissionsGuard`.
- `@CurrentUser()` — param decorator; extracts the authenticated user (or one field of it, e.g.
  `@CurrentUser('email')`) from `request.user`. Only valid on routes that pass `JwtAuthGuard`.

## Rate limiting (Throttler)

Four named tiers are registered globally (`ThrottlerModule.forRoot`,
`apps/backend/src/app.module.ts`). Because all four are *named* and none is the unnamed default,
`ThrottlerGuard` evaluates **all four on every route** — a `@Throttle({ short: ... })` override
replaces only the `short` entry and leaves the other three in force.

| Tier | Intended window | Configured `ttl` | Actual window | Limit |
|---|---|---|---|---|
| `short` | 1 minute | `1 * 60` | 60 ms | 30 requests |
| `medium` | 5 minutes | `5 * 60` | 300 ms | 100 requests |
| `long` | 30 minutes | `30 * 60` | 1800 ms | 500 requests |
| `very-long` | 1 hour | `60 * 60` | 3600 ms | 1000 requests |

> **The configured values are a bug, not a design choice.** `@nestjs/throttler` has taken `ttl` in
> **milliseconds** since v5, and this project pins `6.5.0` — so `ttl: 1 * 60` with the comment
> `// (1 minute)` is a 60-millisecond window, making the global tiers effectively unenforceable
> (30 requests inside 60 ms is not a limit anyone reaches). The per-route auth overrides in
> `auth.controller.ts` use `ttl: 60000` correctly, which is what confirms minutes were intended.
> Fixing `app.module.ts` to milliseconds is in the
> [Gap](#gap-between-current-code-and-target-design) list; until then, treat the only real rate
> limiting in this module as the four per-route overrides below.

Auth-specific overrides on top of the `short` window (`apps/backend/src/auth/auth.controller.ts`):

| Route | Limit |
|---|---|
| `POST /v1/auth/register` | 5 / minute |
| `POST /v1/auth/login` | 10 / minute |
| `POST /v1/auth/refresh` | 20 / minute |
| `POST /v1/auth/change-password` | 5 / minute |
| Everything else under `/v1/auth` (logout, OAuth redirects/callbacks, MFA) | falls back to the global `short` default (30 / minute) |

The login/register/change-password limits exist specifically to blunt credential-stuffing and
brute-force attempts against the password path — they matter less once Microsoft SSO is the only
path a given tenant can use, but they stay in place for the password and Google paths, which
remain live at the API level.

## API surface

All routes are versioned under `/v1/auth` (`RouteNames.AUTH`, `version: '1'` in
`@Controller()`). This is the **current** surface — see [Gap](#gap-between-current-code-and-target-design)
for what needs to change before it matches the InnoPeak tenant model.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/v1/auth/register` | `@Public()` | Password registration. Currently not tenant-scoped. |
| `POST` | `/v1/auth/login` | `@Public()` | Password login. |
| `POST` | `/v1/auth/refresh` | `@Public()` | Exchanges a refresh token for a new access/refresh pair. |
| `POST` | `/v1/auth/logout` | Bearer | Revokes all refresh tokens for the current user. |
| `POST` | `/v1/auth/change-password` | Bearer | Requires the current password. |
| `GET` | `/v1/auth/google` | `@Public()` | Redirects into Google's OAuth consent screen (`AuthGuard('google')`). |
| `GET` | `/v1/auth/google/callback` | `@Public()` | Google OAuth callback; issues app tokens via `handleOAuthLogin`. |
| `GET` | `/v1/auth/github` | `@Public()` | Same pattern for GitHub — not part of this product's scope, see below. |
| `GET` | `/v1/auth/github/callback` | `@Public()` | — |
| `POST` | `/v1/auth/mfa/setup` | Bearer | Issues a TOTP secret + QR code. No matching schema table yet — see below. |
| `POST` | `/v1/auth/mfa/verify` | Bearer | Verifies a TOTP code. |

Not yet present, needed for the target design:

- `GET /v1/auth/microsoft` + `GET /v1/auth/microsoft/callback` — Entra ID SSO, mirroring the
  Google OAuth pair.
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
   `user_identities` for the SSO case. The shipped OnboardingSignup screen supplies the business
   name from the connected Google Business Profile rather than asking for it — see
   `apps/documentation/docs/frontend/overview.md` — so the SSO signup route must treat
   `businessName`/`ownerName` as optional and derive them at connect time.
2. **Login** — password path checks `users.password_hash`; SSO path looks up
   `user_identities(provider, provider_user_id)` and, if `tenant_identity_providers` has an active
   row for that tenant + provider, must also confirm the SSO directory matches
   `provider_tenant_id` before issuing tokens.
3. **Member invite** — owner creates a `password_reset_tokens` row with `purpose = 'invite'` tied
   to a pending `users` row (`status = 'invited'`); invitee accepts via token, then either sets a
   password or completes SSO, which flips `status` to `active`.
4. **Password reset** — `password_reset_tokens` with `purpose = 'reset'`, single-use
   (`used_at`), time-boxed (`expires_at`).
5. **Email verification** — `purpose = 'verify_email'`, password path only. SSO logins skip this
   entirely since the identity provider already vouches for the email, which is why the
   Microsoft-only signup flow has no email-verification step to render at all.
6. **Platform admin invite/login** — same shapes as 1–4 but against `platform_admins` /
   `platform_admin_identities` / `platform_admin_invites`, kept structurally separate per the note
   in [Data model](#data-model).

## Session / token model

- JWT access token, 15-minute expiry (`JwtModule.registerAsync`, `apps/backend/src/auth/auth.module.ts`).
- Refresh token with rotation on use (`POST /v1/auth/refresh`).
- Both are *intended* to travel either as a bearer header or as an HttpOnly cookie (`sid` /
  `refresh_token`, or the `admin_*` variants) — `CookieAuthMiddleware` normalizes cookies into the
  `Authorization` header before the guards run, so the rest of the pipeline only ever deals with
  one shape. Two caveats on the current implementation: cookie promotion is inert until
  `cookie-parser` is registered (see [Global request pipeline](#global-request-pipeline)), and the
  `admin_*` variants are selected purely by *the path containing `dev-tools`* — there is a `TODO`
  in `cookies.middleware.ts` where real platform-admin detection belongs, so this needs extending
  before the platform-admin surface can use cookies at all.
- `JwtPayload` currently carries `sub`, `email`, `roles: string[]`, `permissions: string[]` — needs
  to become `sub`, `tenant_id`, `email`, `role` (singular, matching the `user_role` enum) for the
  tenant-user path, plus an equivalent shape for the platform-admin path that has no `tenant_id`
  at all.

## Gap between current code and target design

`apps/backend/src/auth/` today is the **generic NestJS enterprise boilerplate's** auth module,
not yet adapted to this schema. It compiles and the tests pass, but it models a different product.
Before this module can be considered done for InnoPeak:

- **Add** an Entra ID (Microsoft) Passport strategy and `/v1/auth/microsoft` +
  `/v1/auth/microsoft/callback` routes, mirroring `GoogleOAuthStrategy` — this is the one
  provider the frontend actually calls.
- **Add** `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_CALLBACK_URL`, and a
  tenant/directory identifier to `apps/backend/src/config/env.config.ts` (no Microsoft/Entra env
  vars exist there today — only `GOOGLE_*` and `GITHUB_*`).
- **Replace** `RolesGuard`/`PermissionsGuard`'s `roles: string[]` / `permissions: string[]` model
  with the schema's single `user_role` enum (`owner` \| `member`) — there are no
  `roles`/`permissions`/`user_roles`/`role_permissions` tables anywhere in the migrations.
  `PermissionsGuard` in particular has nothing to check against until permissions are either
  derived from `role` in code or a real permissions table is added — don't wire it up against
  fictional data.
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
- **Wire up** the already-present but unused DTOs (`forgot-password.dto.ts`,
  `reset-password.dto.ts`, `verify-email.dto.ts`) to real controller routes per the flows above.

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

Finally, four concrete defects in the current code that this module's docs assume are fixed:

- **`src/db/drizzle/schema.ts` is stale and describes a different database.** It still declares
  the boilerplate tables (`users` with a `role` column, `roles`, `permissions`, `user_roles`,
  `role_permissions`, `refresh_tokens`, `api_keys`, `mfa_settings`, `oauth_accounts`, …) and has
  never been regenerated from `0000`–`0006`. Every current auth query type-checks against tables
  the database does not have. Run `pnpm db:migrate` then `pnpm db:introspect` before writing any
  code against it.
- **The `refresh_tokens` table does not exist in any migration**, yet `token.repository.ts`
  already reads and writes `schema.refreshTokens`, and this document's
  [Session / token model](#session--token-model) describes rotation and logout-revocation as
  current behaviour. It needs the follow-up migration described in
  [the API reference](./api-reference.md#configuration) before refresh or logout can work as
  specified.
- **Global rate limiting is effectively off** — `ThrottlerModule.forRoot`'s `ttl` values are in
  seconds where `@nestjs/throttler` 6.5.0 expects milliseconds, so the four tiers are 60 ms–3.6 s
  windows rather than 1 minute–1 hour. See [Rate limiting](#rate-limiting-throttler).
- **`cookie-parser` is neither installed nor registered**, so `CookieAuthMiddleware` promotes
  nothing and the cookie-based session path documented above is inert.
- **`pnpm db:seed` cannot seed the root platform admin** — and would fail outright. `src/db/seeds/`
  contains only the boilerplate `001_roles_permissions.sql` and `002_admin_user.sql`, which target
  `roles`/`permissions`/`user_roles` — tables no migration creates — and insert `users` columns
  that don't exist on this schema either (`first_name`, `last_name`, `is_active`,
  `is_email_verified`; note `users.role` *does* exist, `0002_tenant_auth.sql:65`); `seed.sh`
  runs every `[0-9]*.sql` with `ON_ERROR_STOP=1`. Both seed files need replacing with a
  `platform_admins` root-admin seed.

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
