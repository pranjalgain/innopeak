---
sidebar_position: 2
---

# Platform Admin Module — API Reference

## How to read this document

This is the **target/spec design** for the platform-admin module's HTTP surface. None of it exists
in code: `src/api/` contains only `dev-tools`, `health`, `metrics`, and `tracing`, and the only
files under `apps/backend/src/` that mention `platform_admin` are the three migrations and the
migration journal. Nothing below describes current behaviour — see the overview's
[Gap](./overview.md#gap-between-current-code-and-target-design) for the build list, and read
[Platform Admin Module — Overview](./overview.md) first for the data model, the
separate-hierarchy rationale, and the flow narratives this document turns into contracts.

**Authentication endpoints are documented in [Auth Module — API
Reference](../auth/api-reference.md#platform-admin-api) and are deliberately not repeated here.**
Login, refresh, logout, `me`, admin invite, invite acceptance (password and SSO), forgot/reset
password, and the session and cookie model behind all of them are auth's, at
`/v1/platform-admin/auth/...`. This document covers only the *operations* surface layered on top of
an already-authenticated platform-admin session. Where the two meet — the owner invite that
support-assisted provisioning sends, the `type` claim that separates the token kinds — you will
find a cross-reference, not a second copy.

The document is HTTP-contract-level only: no controller or decorator code. When implementing a
route below it lives under `src/api/platform-admin/`, in the multi-controller
`controllers/`/`services/` layout `apps/backend/docs/conventions/module-structure.md` requires
(this module has four operations controllers), with data access in
`src/db/repositories/platform-admin/`. The request/response JSON shown here is what that route's
Swagger decorator — in that controller's own `swagger/<controller-name>.swagger.ts`, never inline
on the method — should render as its example. Every success and error `message` string comes from
`src/common/constants/messages.constants.ts`, which does not exist yet and must be created; never
an inline literal. Endpoints that cannot be implemented until a follow-up migration lands are
marked inline, the same way auth's api-reference flags its missing `refresh_tokens` table.

## Conventions

- **Base path**: every route is versioned under `/v1/platform-admin/...`, via `RouteNames`
  (`version: '1'`). `src/common/route-names.ts` has **no** `PLATFORM_ADMIN*` entry of any kind
  today — including `RouteNames.PLATFORM_ADMIN_AUTH`, which auth's api-reference already cites as
  though it exists. `PLATFORM_ADMIN_TENANTS`, `PLATFORM_ADMIN_SUPPORT_ACCESS`,
  `PLATFORM_ADMIN_METRICS`, and `PLATFORM_ADMIN_ADMINS` are all net-new; `QUEUES_UI =
  'admin/queues'` is the existing precedent for a slash-containing enum value.
- **Auth column**: `Bearer (platform_admin)` — needs `Authorization: Bearer <access_token>` (or the
  `admin_sid` cookie, which `CookieAuthMiddleware` promotes) **and** a payload whose `type` is
  `platform_admin`. A `tenant_user` or `support_access` token is rejected with `403`, not `401`;
  see [Error reference](#error-reference). No route in this document is `@Public()`.
- **Success and error envelopes** are the app-wide ones: `TransformInterceptor` wraps every 2xx in
  `{ statusCode, status, message, data }` and `HttpExceptionFilter` returns
  `{ statusCode, status, message, error, traceId, data: null }` for every non-2xx
  (`src/common/dto/api-response.ts`). The bodies shown below are the *inner* `data` payload. See
  auth's [Conventions](../auth/api-reference.md#conventions) for the full version with worked
  envelope examples and the validation-error collapsing rule.
- **Pagination** on list endpoints is the shared shape from
  `apps/backend/docs/conventions/api-patterns.md`: `page` and `pageSize` arrive as one query DTO,
  the response is `{ data: [], meta: { page, pageSize, total, totalPages } }`, and `totalPages` is
  computed in the service, never the controller.
- **Throttling** falls back to the global `short` tier (30/min) unless a route states otherwise.
  The write routes tighten it, because a mis-scripted loop against them is a platform-wide event.

## Tenant directory

Read-only, cross-tenant. These are the two endpoints that make a support ticket answerable without
a psql session, and the only ones in [MVP scope](./overview.md#mvp-scope) that a first release
genuinely cannot skip.

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/platform-admin/tenants` | Bearer (`platform_admin`) | 30 / min |
| `GET` | `/v1/platform-admin/tenants/:tenantId` | Bearer (`platform_admin`) | 30 / min |

### `GET /v1/platform-admin/tenants`

Lists every tenant on the platform, newest first, with enough state to triage from the list alone:
`tenants.status`, the owning user, and a rolled-up connection-health flag. This is the module's
canonical cross-tenant read — it queries `tenants` with no `tenant_id` filter because `tenants` has
no `tenant_id` column to filter on, which is precisely the property that made `platform_admins` a
separate hierarchy in the first place (`PLAN.md` §2).

The owner is the tenant's `users` row with `role = 'owner'` — a single object, not an array, since
`PLAN.md` §2 puts promoting more owners out of MVP scope. It is nullable, and not as an edge case:
a tenant in `pending_activation` from an abandoned password signup (`PLAN.md` §8.10) or an
unaccepted §4.3d invite has an owner whose `status` is `pending_verification` or `invited`, and one
whose owner was hard-deleted has none. `connectionStatus` is
`review_provider_connections.status` (`google_connection_status`: `active` \| `needs_reauth`), or
`null` when the tenant has never connected a provider — normal before onboarding finishes.
Filtering on `status` uses `idx_tenants_status`; name search has no index and is a sequential scan,
noted so it is not mistaken for an indexed lookup.

| Field | Type | Rules |
|---|---|---|
| `page` | number (query) | optional, default `1`, min `1`. Example `1`. |
| `pageSize` | number (query) | optional, default `20`, min `1`, max `100`. Example `20`. |
| `status` | string (query) | optional, one of `pending_activation` \| `active` \| `suspended` (`tenant_status`). Omit for all. Example `suspended`. |
| `search` | string (query) | optional, 1–255 chars, case-insensitive substring match on `tenants.name`. Example `coffee`. |

Success `200`:

```json
{
  "data": [
    {
      "id": "0190f3aa-6d21-7c94-9c1e-2f5a0b7d4e11",
      "name": "The Coffee House",
      "status": "active",
      "createdByPlatformAdminId": null,
      "createdAt": "2026-07-14T09:12:04.418Z",
      "owner": { "id": "0190f3b2-1a44-7f02-bd77-9c0e12ab3344", "email": "jane@thecoffeehouse.com", "name": "Jane Doe", "status": "active" },
      "userCount": 3,
      "locationCount": 1,
      "connectionStatus": "active"
    },
    {
      "id": "0190f4c1-88ba-7a55-8410-6d3f9e0c7722",
      "name": "Northside Dental",
      "status": "pending_activation",
      "createdByPlatformAdminId": "0190f2ee-4c31-7b18-a2d0-11ff87c65a90",
      "createdAt": "2026-08-30T16:40:51.002Z",
      "owner": { "id": "0190f4c1-9012-7d67-bb31-4c1a55de9081", "email": "ops@northsidedental.com", "name": "Ravi Menon", "status": "invited" },
      "userCount": 1,
      "locationCount": 0,
      "connectionStatus": null
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 2, "totalPages": 1 }
}
```

Errors: `400` validation (unknown `status` value, `pageSize` out of range), `401`, `403
NOT_A_PLATFORM_ADMIN`, `403 PLATFORM_ADMIN_DISABLED`, `429`.

### `GET /v1/platform-admin/tenants/:tenantId`

The single-tenant inspection view: everything the list shows, plus the user roster, the provider
connection in full, and per-location sync health. This is what a support engineer opens when a
customer says "no new reviews have shown up," and the fields chosen are exactly the ones the
[Connections Module](../connections/overview.md) identifies as the sync-observability trio —
`locations.last_synced_at`, `last_sync_status` (`sync_health_status`: `ok` \| `error`), and
`last_sync_error`.

It deliberately returns **no review content**. Reading a tenant's reviews is support access
(below), which is a separate, logged, time-boxed grant — not something a tenant-inspection call
should hand over as a side effect. The review numbers here are counts only.

| Field | Type | Rules |
|---|---|---|
| `tenantId` | string (path) | required, UUID. Example `0190f3aa-6d21-7c94-9c1e-2f5a0b7d4e11`. |

Success `200`:

```json
{
  "id": "0190f3aa-6d21-7c94-9c1e-2f5a0b7d4e11",
  "name": "The Coffee House",
  "status": "active",
  "createdByPlatformAdminId": null,
  "createdAt": "2026-07-14T09:12:04.418Z",
  "updatedAt": "2026-09-01T11:02:17.900Z",
  "settings": { "escalationRatingThreshold": 3, "autoPostEnabled": false, "reviewDataRetentionMonths": 24 },
  "users": [
    { "id": "0190f3b2-1a44-7f02-bd77-9c0e12ab3344", "email": "jane@thecoffeehouse.com", "name": "Jane Doe", "role": "owner", "status": "active", "emailVerifiedAt": "2026-07-14T09:19:33.120Z" },
    { "id": "0190f3c9-2277-7e10-9ab4-83f00c1d7755", "email": "sam@thecoffeehouse.com", "name": "Sam Ali", "role": "member", "status": "invited", "emailVerifiedAt": null }
  ],
  "connection": {
    "id": "0190f3d0-51aa-7c33-b0e9-77b2a4e10099",
    "provider": "google",
    "providerAccountId": "accounts/113355779911",
    "status": "active",
    "tokenExpiresAt": "2026-09-04T13:45:00.000Z",
    "connectedByUserId": "0190f3b2-1a44-7f02-bd77-9c0e12ab3344"
  },
  "locations": [
    { "id": "0190f3d4-7c02-7b88-9931-0af5c2d61188", "name": "The Coffee House — High Street", "status": "active", "lastSyncedAt": "2026-09-04T08:15:02.771Z", "lastSyncStatus": "ok", "lastSyncError": null, "onboardingBackfillCompletedAt": "2026-07-14T10:04:55.310Z" }
  ],
  "reviewCounts": { "total": 412, "new": 3, "inReview": 1, "responded": 402, "dismissed": 6, "escalated": 11 }
}
```

Errors: `400` validation (malformed UUID), `401`, `403 NOT_A_PLATFORM_ADMIN`, `403
PLATFORM_ADMIN_DISABLED`, `404 TENANT_NOT_FOUND`, `429`.

## Tenant lifecycle

The only writer of `tenants.status = 'suspended'` anywhere in the system. Both routes are
idempotency-checked rather than idempotent: re-suspending an already-suspended tenant is a `400`,
not a silent success, because in a support workflow "it was already suspended" is information the
operator needs, not noise to swallow.

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/platform-admin/tenants/:tenantId/suspend` | Bearer (`platform_admin`) | 10 / min |
| `POST` | `/v1/platform-admin/tenants/:tenantId/unsuspend` | Bearer (`platform_admin`) | 10 / min |

### `POST /v1/platform-admin/tenants/:tenantId/suspend`

Writes `UPDATE tenants SET status = 'suspended'`. Auth's login path already reads that column and
returns `403 TENANT_SUSPENDED` (see auth's [error
reference](../auth/api-reference.md#error-reference)), so new logins and refreshes stop
immediately.

**Suspension is not instant for tokens already issued, and this endpoint says so in its
response.** `PLAN.md` §8.20 accepts and does not fix this: access tokens are stateless JWTs
validated by signature, not by a database lookup, so a user holding one issued a minute ago keeps
working for the remainder of its lifetime — 15 minutes by default. `accessRevokedAfter` in the
response is that deadline, computed as now plus the configured access-token TTL. It is not a
promise the platform enforces; it is the point after which no token minted before the suspension
can still validate. For a support workflow that means suspension is a *policy* action, not a kill
switch: if a tenant must be cut off *now* — active abuse, a legal hold — the operator has to either
wait out the window before confirming containment, or escalate to something outside this API
(rotating credentials at the provider, an infrastructure block). §8.20 lists the two designs that
would close the gap, a per-request tenant-status check or a `tenant_id` deny-list, and explains why
neither is built by default.

A second gap, stated at the point of action rather than buried: suspension stops *people*, not
*polling*. Nothing in the schema gates the review pipeline on `tenants.status`, and the pipeline
holds no access token for §8.20 to expire — so until it filters on `status = 'active'` (flagged in
the overview's [Gap](./overview.md#gap-between-current-code-and-target-design)), a suspended tenant
keeps ingesting reviews and, if `tenant_settings.auto_post_enabled` is true, keeps posting replies.
`pipelineHalted` reports what is actually true rather than what would be reassuring.

`reason` is required and persists nowhere today: `audit_logs` captures the status change via
`tenants_audit_trigger` but has no column for a reason and, per the overview's [Tenant scoping and
attribution](./overview.md#tenant-scoping-and-attribution), none for the actor either. Collecting
it now puts the field in the contract ahead of the storage rather than retrofitting a shipped API.

Request:

```json
{
  "reason": "Non-payment — finance escalation FIN-2291"
}
```

| Field | Type | Rules |
|---|---|---|
| `tenantId` | string (path) | required, UUID. Example `0190f3aa-6d21-7c94-9c1e-2f5a0b7d4e11`. |
| `reason` | string | required, 5–500 chars. Free text; shown back in the audit view. Example `Non-payment — finance escalation FIN-2291`. |

Success `200`:

```json
{
  "tenantId": "0190f3aa-6d21-7c94-9c1e-2f5a0b7d4e11",
  "status": "suspended",
  "suspendedAt": "2026-09-04T12:00:00.000Z",
  "accessRevokedAfter": "2026-09-04T12:15:00.000Z",
  "pipelineHalted": false,
  "message": "Tenant suspended. Existing access tokens remain valid until 2026-09-04T12:15:00.000Z."
}
```

Errors: `400` validation, `400 TENANT_ALREADY_SUSPENDED`, `401`, `403 NOT_A_PLATFORM_ADMIN`, `403
PLATFORM_ADMIN_DISABLED`, `404 TENANT_NOT_FOUND`, `429`.

### `POST /v1/platform-admin/tenants/:tenantId/unsuspend`

Lifts a suspension. **It does not write `active` unconditionally**, because `tenant_status` has no
"previous status" value and the schema keeps no suspension history — a tenant suspended while it
was still `pending_activation` would otherwise be silently promoted to activated by being
unsuspended, and the product would treat an owner who never accepted their invite as a working
owner.

`PLAN.md` §2 supplies the rule that resolves this with no new schema: `pending_activation` "flips
to `active` the moment the owner's `users.status` becomes `active` — the tenant tracks whether it
has a working owner, not the other way around." So the target status is derived at unsuspend time:
`active` if the tenant has at least one `users` row with `role = 'owner' AND status = 'active'`,
otherwise `pending_activation`. `restoredTo` reports which branch was taken, so an operator who
expected `active` and got `pending_activation` learns the reason from the response instead of a
support thread.

Request:

```json
{
  "reason": "Invoice FIN-2291 settled"
}
```

| Field | Type | Rules |
|---|---|---|
| `tenantId` | string (path) | required, UUID. Example `0190f3aa-6d21-7c94-9c1e-2f5a0b7d4e11`. |
| `reason` | string | required, 5–500 chars. Example `Invoice FIN-2291 settled`. |

Success `200`:

```json
{
  "tenantId": "0190f3aa-6d21-7c94-9c1e-2f5a0b7d4e11",
  "status": "pending_activation",
  "restoredTo": "pending_activation",
  "restoredBecause": "no_active_owner",
  "unsuspendedAt": "2026-09-04T14:32:11.640Z",
  "message": "Tenant unsuspended. No active owner found, so the tenant was restored to pending_activation."
}
```

Errors: `400` validation, `400 TENANT_NOT_SUSPENDED`, `401`, `403 NOT_A_PLATFORM_ADMIN`, `403
PLATFORM_ADMIN_DISABLED`, `404 TENANT_NOT_FOUND`, `429`.

## Tenant provisioning

One endpoint, and it is the exception path — `PLAN.md` §2 says outright not to design the primary
flow around `created_by_platform_admin_id`, and §4.3d calls support-assisted creation "the rare
case." Tenant creation is self-service (§4.3a).

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/platform-admin/tenants` | Bearer (`platform_admin`) | 5 / min |

### `POST /v1/platform-admin/tenants`

Creates a tenant and invites its owner in one call — `PLAN.md` §4.3d, the flow behind
`tenants.created_by_platform_admin_id`. §4.3d frames it as the member-invite mechanic (§4.3b) one
level up: instead of an owner inviting a member into an existing tenant, a platform admin invites
an *owner* into a *new* tenant. Auth's api-reference explicitly
[defers](../auth/api-reference.md#platform-admin-api) this initiating action to "whatever module
owns platform-admin tenant management"; this endpoint is it.

Four rows in one transaction, per §4.3d's diagram and §8.10's atomicity requirement:

```sql
INSERT INTO tenants (name, created_by_platform_admin_id, status)
     VALUES ($1, $2, 'pending_activation');
INSERT INTO users (tenant_id, name, email, role, status, invited_by_user_id)
     VALUES ($3, $4, $5, 'owner', 'invited', NULL);
INSERT INTO tenant_settings (tenant_id, escalation_rating_threshold, auto_post_enabled)
     VALUES ($3, 3, false);
INSERT INTO password_reset_tokens (user_id, token_hash, purpose, expires_at)
     VALUES ($6, $7, 'invite', $8);
```

Three column choices in there are deliberate and easy to get wrong. `created_by_platform_admin_id`
is taken from the authenticated token, never the request body. `invited_by_user_id` is `NULL`
because that column is a self-FK to `users(id)` and the inviter is a `platform_admins` row it
cannot point at — `0002_tenant_auth.sql`'s own comment and `PLAN.md` §2 both say so, and this is
the concrete case where the schema simply has no way to record who invited this owner. And the
owner's `status` is `invited`, not `pending_verification`: §4.3d states that the platform admin
addressing the invite to a specific mailbox is the equivalent assurance a member invite carries, so
there is no separate email-verification step. `tenant_settings` is in the transaction because
`escalation_rating_threshold` is `NOT NULL` with no default and classification depends on the row
existing (`PLAN.md` §8.10 — the case earlier drafts of that flow left undefined).

**Everything after the invite email is auth's, unmodified.** The owner accepts through [`POST
/v1/auth/invite/accept`](../auth/api-reference.md#post-v1authinviteaccept) (password) or [`GET
/v1/auth/invite/:token/microsoft`](../auth/api-reference.md#get-v1authinvitetokenmicrosoft) (SSO),
including the IdP-email-match check §4.3d inherits from §4.3b and the guarded compare-and-swap
token consumption from §8.7. Those mechanics are not repeated here. Acceptance is what flips
`users.status` to `active` and `tenants.status` to `active`; this endpoint never returns an
activated tenant.

There is deliberately no `409` for an email that already exists. `users` is unique on
`(tenant_id, email)`, and the tenant here is brand new, so no conflict is reachable — the same
email legitimately owning several tenants is supported by design (`PLAN.md` §2). The one
constraint that *can* bite is global: `user_identities` is unique on `(provider,
provider_user_id)`, so if this owner later accepts by SSO with a Microsoft account already linked
to another `users` row, that fails at acceptance time in auth's flow (`PLAN.md` §8.21), not here.

Request:

```json
{
  "businessName": "Northside Dental",
  "ownerName": "Ravi Menon",
  "ownerEmail": "ops@northsidedental.com",
  "reason": "Sales-led onboarding — deal ACC-4471"
}
```

| Field | Type | Rules |
|---|---|---|
| `businessName` | string | required, 1–255 chars → `tenants.name`. Example `Northside Dental`. |
| `ownerName` | string | required, 1–255 chars → `users.name` (`NOT NULL`, so it cannot be deferred to acceptance). Example `Ravi Menon`. |
| `ownerEmail` | string | required, valid email, ≤255 chars → `users.email`. The invite is sent here and the SSO acceptance path requires the IdP-verified email to match it exactly. Example `ops@northsidedental.com`. |
| `reason` | string | required, 5–500 chars. Why a tenant was created by staff rather than self-service. Example `Sales-led onboarding — deal ACC-4471`. |

Success `201`:

```json
{
  "tenantId": "0190f4c1-88ba-7a55-8410-6d3f9e0c7722",
  "tenantStatus": "pending_activation",
  "owner": {
    "id": "0190f4c1-9012-7d67-bb31-4c1a55de9081",
    "email": "ops@northsidedental.com",
    "status": "invited"
  },
  "inviteExpiresAt": "2026-09-07T14:40:00.000Z",
  "createdByPlatformAdminId": "0190f2ee-4c31-7b18-a2d0-11ff87c65a90",
  "message": "Tenant created and owner invite sent to ops@northsidedental.com."
}
```

`inviteExpiresAt` is `password_reset_tokens.expires_at`, driven by auth's
`INVITE_TOKEN_TTL_HOURS` (default 72) — see auth's
[Configuration](../auth/api-reference.md#configuration). This module introduces no invite config of
its own.

Errors: `400` validation, `401`, `403 NOT_A_PLATFORM_ADMIN`, `403 PLATFORM_ADMIN_DISABLED`, `429`,
`500` (a partial transaction must roll back the whole four-row insert — §8.10).

## Support access

**Blocked on a follow-up migration.** All three routes need the
`platform_admin_support_grants` table sketched in the overview's [Tenant scoping and
attribution](./overview.md#tenant-scoping-and-attribution); it exists in no migration today. The
contract is specified now because this is the one part of the module that can go wrong quietly,
and leaving the token shape to implementation time is how a cross-tenant bypass flag gets added
instead of a scoped token.

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/platform-admin/tenants/:tenantId/support-access` | Bearer (`platform_admin`) | 5 / min |
| `GET` | `/v1/platform-admin/support-access` | Bearer (`platform_admin`) | 30 / min |
| `DELETE` | `/v1/platform-admin/support-access/:grantId` | Bearer (`platform_admin`) | 10 / min |

### `POST /v1/platform-admin/tenants/:tenantId/support-access`

Mints a **read-only, single-tenant, short-lived act-as token** so a platform admin can see a
tenant's data through the ordinary tenant-scoped API. The full rationale for a scoped token over a
bypass flag is in the overview's [Tenant scoping and
attribution](./overview.md#tenant-scoping-and-attribution); the short version is that a scoped
token leaves every tenant-scoped repository query byte-for-byte unchanged — it reads `tenantId` off
the payload and filters on it exactly as it does for a tenant user — so there is one place that can
be wrong (this mint) instead of a `tenant_id` filter in every repository that can be forgotten.

Read-only is not a conservative default; it is the only thing the schema can express. Tenant tables
attribute writes to `users.id` (`review_responses.created_by_user_id` / `approved_by_user_id`,
`review_provider_connections.connected_by_user_id NOT NULL REFERENCES users(id)`), and this token's
`sub` is a `platform_admins.id`, which is not one. The only column in the whole schema referencing
`platform_admins` from outside its own three tables is `tenants.created_by_platform_admin_id` —
there is no "acted by platform admin" concept on any tenant-scoped table, so a write through a
support session would violate a foreign key or be misattributed to a real tenant user.

Request:

```json
{
  "reason": "Ticket SUP-8842 — customer reports missing reviews since 2026-08-28",
  "ttlMinutes": 15
}
```

| Field | Type | Rules |
|---|---|---|
| `tenantId` | string (path) | required, UUID. Must exist. Example `0190f3aa-6d21-7c94-9c1e-2f5a0b7d4e11`. |
| `reason` | string | required, 10–500 chars. Longer minimum than the lifecycle routes on purpose — this is the field an oversight review reads. Example `Ticket SUP-8842 — customer reports missing reviews since 2026-08-28`. |
| `ttlMinutes` | number | optional, default `15`, min `5`, max `60`. Bounds the grant. Non-refreshable, so this is the whole session. Example `15`. |

Success `201`:

```json
{
  "grantId": "0190f5aa-2c11-7f40-b6d2-08e91c5a7733",
  "tenantId": "0190f3aa-6d21-7c94-9c1e-2f5a0b7d4e11",
  "tenantName": "The Coffee House",
  "supportAccessToken": "eyJhbGciOiJIUzI1NiIs...",
  "scope": "read_only",
  "expiresAt": "2026-09-04T12:15:00.000Z",
  "message": "Read-only support access granted for 15 minutes."
}
```

Errors: `400` validation, `401`, `403 NOT_A_PLATFORM_ADMIN`, `403 PLATFORM_ADMIN_DISABLED`, `403
SUPPORT_ACCESS_TOKEN_ON_PLATFORM_ROUTE` (a support token cannot mint another), `404
TENANT_NOT_FOUND`, `409 SUPPORT_ACCESS_ALREADY_ACTIVE`, `429`.

#### Support-access token model

```ts
// Minted only by the route above. Never by the auth module.
{
  sub: '<platform_admins.id>',      // NOT a users.id — see the FK note above
  type: 'support_access',
  tenantId: '<tenants.id>',         // exactly one, fixed at mint time
  platformAdminId: '<platform_admins.id>',
  grantId: '<platform_admin_support_grants.id>',
  scope: 'read_only',
  exp: '<mint + ttlMinutes>'        // non-refreshable: POST /v1/auth/refresh must reject it
}
```

Four rules, each an executed check rather than a documented intention — the overview's [Tenant
scoping and attribution](./overview.md#tenant-scoping-and-attribution) has the reasoning behind
each; this is the enforcement list:

1. `type: 'support_access'` is accepted **only** on tenant-scoped routes, never on
   `/v1/platform-admin/...` — otherwise it becomes a full platform-admin token that happens to
   carry a `tenantId`, including the power to mint grants for other tenants.
2. `type: 'platform_admin'` is accepted **only** on `/v1/platform-admin/...`. Reject on `type`,
   before scoping.
3. The payload carries **no `role`**, so every `@Roles('owner')` route fails closed for it.
4. Read-only is an **allow-list**: `SupportAccessGuard` rejects any non-`GET` request and any route
   carrying `@Roles(...)`, so a tenant-scoped write route added later is closed by default.

### `GET /v1/platform-admin/support-access`

Lists grants — active first, then expired and revoked — so support access is reviewable rather than
invisible. This is the oversight surface, and it is the reason the grant table has to exist before
the mint endpoint ships: without it, a support session leaves behind nothing at all.

It records that a grant was *issued*, not what was *read* through it. `log_db_changes()` is a write
trigger and cannot log a read; `PLAN.md` §6.1 anticipates exactly this, naming "logging a *read*
rather than a write, e.g. 'a platform admin viewed this tenant's data'" as the one need that would
justify a purpose-built table with a proper `user_id`. A per-request read trail
(`platform_admin_access_events`) is a second, separate follow-up — see the overview's [Tenant
scoping and attribution](./overview.md#tenant-scoping-and-attribution).

| Field | Type | Rules |
|---|---|---|
| `page` | number (query) | optional, default `1`, min `1`. Example `1`. |
| `pageSize` | number (query) | optional, default `20`, min `1`, max `100`. Example `20`. |
| `tenantId` | string (query) | optional, UUID. Narrows to one tenant's grant history. Example `0190f3aa-6d21-7c94-9c1e-2f5a0b7d4e11`. |
| `activeOnly` | boolean (query) | optional, default `false`. `true` returns only grants where `revoked_at IS NULL AND expires_at > now()`. Example `true`. |

Success `200`:

```json
{
  "data": [
    {
      "grantId": "0190f5aa-2c11-7f40-b6d2-08e91c5a7733",
      "tenantId": "0190f3aa-6d21-7c94-9c1e-2f5a0b7d4e11",
      "tenantName": "The Coffee House",
      "platformAdminId": "0190f2ee-4c31-7b18-a2d0-11ff87c65a90",
      "platformAdminEmail": "support@geekyants.com",
      "reason": "Ticket SUP-8842 — customer reports missing reviews since 2026-08-28",
      "createdAt": "2026-09-04T12:00:00.000Z",
      "expiresAt": "2026-09-04T12:15:00.000Z",
      "revokedAt": null,
      "state": "active"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

`state` is derived, not stored: `revoked` if `revoked_at IS NOT NULL`, else `expired` if
`expires_at <= now()`, else `active`.

Errors: `400` validation, `401`, `403 NOT_A_PLATFORM_ADMIN`, `403 PLATFORM_ADMIN_DISABLED`, `429`.

### `DELETE /v1/platform-admin/support-access/:grantId`

Sets `revoked_at = now()` on a grant. Any platform admin may revoke any grant, including another
admin's — a flat hierarchy has no escalation path, and the alternative (only the granting admin can
revoke) means an unreachable colleague's session cannot be cut short.

**Revocation has the same latency as suspension, for the same reason.** The support-access token is
a stateless JWT; revoking the grant stops the next mint and marks the record, but the token already
in the admin's hand keeps validating until `exp`. That is why the TTL is capped at 60 minutes and
the token is non-refreshable: the TTL, not this endpoint, is what actually bounds a support
session. Closing the gap needs the same machinery `PLAN.md` §8.20 declines to build for tenant
suspension — a per-request status check, or a short-lived deny-list keyed on `grantId`.

| Field | Type | Rules |
|---|---|---|
| `grantId` | string (path) | required, UUID. Example `0190f5aa-2c11-7f40-b6d2-08e91c5a7733`. |

Success `200`:

```json
{
  "grantId": "0190f5aa-2c11-7f40-b6d2-08e91c5a7733",
  "revokedAt": "2026-09-04T12:06:41.115Z",
  "tokenValidUntil": "2026-09-04T12:15:00.000Z",
  "message": "Support access revoked. The issued token remains valid until 2026-09-04T12:15:00.000Z."
}
```

Errors: `400` validation, `400 SUPPORT_ACCESS_ALREADY_REVOKED`, `401`, `403
NOT_A_PLATFORM_ADMIN`, `403 PLATFORM_ADMIN_DISABLED`, `404 SUPPORT_ACCESS_GRANT_NOT_FOUND`, `429`.

## Platform metrics

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/platform-admin/metrics/overview` | Bearer (`platform_admin`) | 10 / min |

### `GET /v1/platform-admin/metrics/overview`

The cross-tenant health snapshot: how many tenants exist in each `tenant_status`, how many
provider connections are `needs_reauth`, how many locations have `last_sync_status = 'error'`, and
platform-wide review throughput. `PLAN.md` §2 lists "cross-tenant visibility/metrics" as one of the
three things `platform_admins` exists for; this is that.

**Aggregates only, never rows.** Every number here is a `COUNT` or an `AVG`. No `reviewer_name`, no
`review_text`, no tenant-user email crosses this endpoint — reading a tenant's actual data is
support access, which is time-boxed and recorded, and a metrics call must not be a way around it.
This is a contract constraint, not a suggestion: the response shape has no field that could carry
row content.

**This is the most expensive endpoint in the module and the most deferrable.** `reviews` is indexed
on `tenant_id`, `location_id`, `status`, `classification`, and `reviewed_at`, but a platform-wide
count spans the whole table by design — there is no index that helps, because there is nothing to
narrow by. Fine at one tenant, a full scan later. It should be materialized or cached (a nightly
rollup, or Redis with a short TTL) before it means anything at scale, and it is last in [MVP
scope](./overview.md#mvp-scope) partly for that reason. The 10/min throttle is deliberately
tighter than the other read routes.

| Field | Type | Rules |
|---|---|---|
| `windowDays` | number (query) | optional, default `7`, min `1`, max `90`. Window for the throughput figures; the tenant and connection counts are point-in-time and ignore it. Example `7`. |

Success `200`:

```json
{
  "generatedAt": "2026-09-04T12:30:00.000Z",
  "windowDays": 7,
  "tenants": { "total": 24, "pendingActivation": 3, "active": 20, "suspended": 1 },
  "users": { "total": 61, "active": 54, "invited": 4, "pendingVerification": 2, "disabled": 1 },
  "connections": { "total": 21, "active": 19, "needsReauth": 2 },
  "locations": { "total": 27, "active": 26, "inactive": 1, "syncErrors": 2, "neverSynced": 1 },
  "reviews": { "ingestedInWindow": 1840, "escalatedInWindow": 96, "pendingClassification": 4 },
  "syncRuns": { "inWindow": 6714, "errorsInWindow": 31, "currentlyRunning": 2 },
  "platformAdmins": { "total": 3, "active": 2, "invited": 1, "disabled": 0 }
}
```

Errors: `400` validation, `401`, `403 NOT_A_PLATFORM_ADMIN`, `403 PLATFORM_ADMIN_DISABLED`, `429`.

## Platform admin management

Listing and disabling admins. **Inviting one is not here** — that is [`POST
/v1/platform-admin/auth/invite`](../auth/api-reference.md#platform-admin-api), owned by the auth
module, along with the whole `platform_admin_invites` lifecycle.

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/platform-admin/admins` | Bearer (`platform_admin`) | 30 / min |
| `POST` | `/v1/platform-admin/admins/:adminId/disable` | Bearer (`platform_admin`) | 10 / min |
| `POST` | `/v1/platform-admin/admins/:adminId/enable` | Bearer (`platform_admin`) | 10 / min |

### `GET /v1/platform-admin/admins`

Lists `platform_admins` with invite lineage. Two schema facts shape the response and are worth
knowing before wondering what is missing: **`platform_admins` has no `name` column**, so email is
the only human-readable identifier available, and it has **no `role` column** — the hierarchy is
flat, differentiated only by `invited_by_platform_admin_id`, which is why the response exposes
lineage instead of a permission level. `isRoot` is derived from
`invited_by_platform_admin_id IS NULL`, which the partial unique index
`idx_platform_admins_single_root` guarantees is true for at most one row.

`identityProviders` reads `platform_admin_identities.provider`. It answers "can this admin still
sign in if we clear their password?" — note that table has no `email` column of its own, unlike
`user_identities`, so there is no per-identity email to report.

| Field | Type | Rules |
|---|---|---|
| `page` | number (query) | optional, default `1`, min `1`. Example `1`. |
| `pageSize` | number (query) | optional, default `20`, min `1`, max `100`. Example `20`. |
| `status` | string (query) | optional, one of `invited` \| `active` \| `disabled` (`platform_admin_status`). Example `active`. |

Success `200`:

```json
{
  "data": [
    {
      "id": "0190f2ee-4c31-7b18-a2d0-11ff87c65a90",
      "email": "support@geekyants.com",
      "status": "active",
      "isRoot": true,
      "invitedByPlatformAdminId": null,
      "hasPassword": true,
      "identityProviders": ["entra_id"],
      "createdAt": "2026-06-02T08:00:00.000Z"
    },
    {
      "id": "0190f2ef-9911-7a02-8c55-77b0d3ee1120",
      "email": "ops2@geekyants.com",
      "status": "invited",
      "isRoot": false,
      "invitedByPlatformAdminId": "0190f2ee-4c31-7b18-a2d0-11ff87c65a90",
      "hasPassword": false,
      "identityProviders": [],
      "createdAt": "2026-09-01T10:22:13.005Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 2, "totalPages": 1 }
}
```

`hasPassword` is `password_hash IS NOT NULL` — the hash itself is never returned in any shape.

Errors: `400` validation, `401`, `403 NOT_A_PLATFORM_ADMIN`, `403 PLATFORM_ADMIN_DISABLED`, `429`.

### `POST /v1/platform-admin/admins/:adminId/disable`

Sets `platform_admins.status = 'disabled'`. Auth's login path already rejects a disabled admin with
`403 ACCOUNT_DISABLED` (see auth's [error
reference](../auth/api-reference.md#error-reference)), so this is the offboarding action.

**Never a row delete, ever.** `invited_by_platform_admin_id` is `ON DELETE SET NULL` and
`tenants.created_by_platform_admin_id` is `ON DELETE SET NULL` — deleting an admin row would
silently erase both the invite lineage of everyone they invited and the record of which tenants
they provisioned. This mirrors `PLAN.md` §6.2's staff-erasure reasoning for `users` (anonymize in
place, never hard-delete, so accountability references stay valid) applied one level up. There is
no delete endpoint in this module for the same reason.

Two guards on top of validation. Disabling **yourself** is rejected (`400 CANNOT_DISABLE_SELF`).
Disabling the **last active** admin is rejected (`409 CANNOT_DISABLE_LAST_ACTIVE_ADMIN`), because
there is no self-service platform-admin signup by design (`PLAN.md` §2: allowing one "would be a
privilege-escalation hole, not a feature") and `idx_platform_admins_single_root` prevents seeding a
second root, so locking the platform out of its own admin surface would need a DBA to undo. That
check is inherently racy — two admins disabling each other concurrently can both pass it — so it
needs a guarded conditional `UPDATE` (proceed only while another `active` admin exists), not a
read-then-write.

**Disabling an admin does not invalidate their live tokens** or revoke their outstanding
support-access grants — the same stateless-JWT reason as `PLAN.md` §8.20, one hierarchy up. The
offboarding runbook is therefore three steps: disable the admin, revoke their active grants via
[`DELETE /v1/platform-admin/support-access/:grantId`](#delete-v1platform-adminsupport-accessgrantid),
then wait out the access-token window before treating the account as closed.

Request:

```json
{
  "reason": "Offboarded 2026-09-04 — left GeekyAnts"
}
```

| Field | Type | Rules |
|---|---|---|
| `adminId` | string (path) | required, UUID. Must not be the caller's own id. Example `0190f2ef-9911-7a02-8c55-77b0d3ee1120`. |
| `reason` | string | required, 5–500 chars. Example `Offboarded 2026-09-04 — left GeekyAnts`. |

Success `200`:

```json
{
  "id": "0190f2ef-9911-7a02-8c55-77b0d3ee1120",
  "email": "ops2@geekyants.com",
  "status": "disabled",
  "activeSupportGrantsRemaining": 1,
  "message": "Platform admin disabled. Revoke their 1 active support-access grant separately."
}
```

Errors: `400` validation, `400 CANNOT_DISABLE_SELF`, `400 PLATFORM_ADMIN_ALREADY_DISABLED`, `401`,
`403 NOT_A_PLATFORM_ADMIN`, `403 PLATFORM_ADMIN_DISABLED`, `404 PLATFORM_ADMIN_NOT_FOUND`, `409
CANNOT_DISABLE_LAST_ACTIVE_ADMIN`, `429`.

### `POST /v1/platform-admin/admins/:adminId/enable`

Sets `platform_admins.status = 'active'`. Re-enables an admin disabled by the route above.

It only accepts a `disabled` admin. An `invited` admin **cannot** be enabled this way — `invited`
means they have never accepted their invite and, for a password-path admin, have no
`password_hash` at all, so flipping them to `active` would create an account nobody can sign into
while looking, in every list, exactly like a working one. Reactivating a stalled invite is auth's
job: a fresh `platform_admin_invites` row via [`POST
/v1/platform-admin/auth/invite`](../auth/api-reference.md#platform-admin-api). This endpoint returns
`400 CANNOT_ENABLE_INVITED_ADMIN` and says so.

Request:

```json
{
  "reason": "Returned from sabbatical — re-enabling per HR-1180"
}
```

| Field | Type | Rules |
|---|---|---|
| `adminId` | string (path) | required, UUID. Current `status` must be `disabled`. Example `0190f2ef-9911-7a02-8c55-77b0d3ee1120`. |
| `reason` | string | required, 5–500 chars. Example `Returned from sabbatical — re-enabling per HR-1180`. |

Success `200`:

```json
{
  "id": "0190f2ef-9911-7a02-8c55-77b0d3ee1120",
  "email": "ops2@geekyants.com",
  "status": "active",
  "message": "Platform admin re-enabled."
}
```

Errors: `400` validation, `400 CANNOT_ENABLE_INVITED_ADMIN`, `400
PLATFORM_ADMIN_ALREADY_ACTIVE`, `401`, `403 NOT_A_PLATFORM_ADMIN`, `403 PLATFORM_ADMIN_DISABLED`,
`404 PLATFORM_ADMIN_NOT_FOUND`, `429`.

## Error reference

Every error uses the app-wide error envelope described in [Conventions](#conventions). `message` is
the exact string to render, sourced from `src/common/constants/messages.constants.ts`; the code in
parentheses is the category string the client branches on.

| Status | Code | Route(s) | When |
|---|---|---|---|
| `400` | `Validation Error` | Any route with a body or query DTO | A `class-validator` rule failed. `message` is a comma-joined list of violations. |
| `400` | `TENANT_ALREADY_SUSPENDED` | `POST /tenants/:tenantId/suspend` | `tenants.status` is already `suspended`. Surfaced rather than swallowed — "already suspended" is information an operator needs. |
| `400` | `TENANT_NOT_SUSPENDED` | `POST /tenants/:tenantId/unsuspend` | `tenants.status` is `active` or `pending_activation`; there is nothing to lift. |
| `400` | `SUPPORT_ACCESS_ALREADY_REVOKED` | `DELETE /support-access/:grantId` | The grant's `revoked_at` is already set. |
| `400` | `CANNOT_DISABLE_SELF` | `POST /admins/:adminId/disable` | `adminId` equals the caller's own `sub`. |
| `400` | `PLATFORM_ADMIN_ALREADY_DISABLED` | `POST /admins/:adminId/disable` | Target `status` is already `disabled`. |
| `400` | `PLATFORM_ADMIN_ALREADY_ACTIVE` | `POST /admins/:adminId/enable` | Target `status` is already `active`. |
| `400` | `CANNOT_ENABLE_INVITED_ADMIN` | `POST /admins/:adminId/enable` | Target `status` is `invited`. Send a fresh invite through the auth module instead. |
| `401` | `Unauthorized` | Every route | Missing, malformed, or expired access token. No route here is `@Public()`. |
| `403` | `NOT_A_PLATFORM_ADMIN` | Every route | The token validated but its `type` is not `platform_admin` — a `tenant_user` token, typically. `403` not `401` on purpose: the credential is good, the principal is wrong. |
| `403` | `SUPPORT_ACCESS_TOKEN_ON_PLATFORM_ROUTE` | Every route | The token's `type` is `support_access`. Separated from `NOT_A_PLATFORM_ADMIN` because it is the specific confusion with real blast radius — see [Security considerations](#security-considerations). |
| `403` | `PLATFORM_ADMIN_DISABLED` | Every route | The caller's `platform_admins.status` is `disabled` but their access token has not expired yet. Checked per request, since disabling does not invalidate live tokens. |
| `403` | `SUPPORT_ACCESS_READ_ONLY` | Tenant-scoped routes, with a `support_access` token | `SupportAccessGuard` rejected a non-`GET` request or a route carrying `@Roles(...)`. Raised by the tenant-scoped module, listed here because this module mints the token. |
| `404` | `TENANT_NOT_FOUND` | `GET`/`POST` on `/tenants/:tenantId/...` | No `tenants` row with that id. Cross-tenant reads have no enumeration concern to protect — the caller is already authorized to see every tenant — so a plain `404` is correct here, unlike auth's deliberate avoidance of `404`. |
| `404` | `PLATFORM_ADMIN_NOT_FOUND` | `POST /admins/:adminId/disable` \| `/enable` | No `platform_admins` row with that id. |
| `404` | `SUPPORT_ACCESS_GRANT_NOT_FOUND` | `DELETE /support-access/:grantId` | No grant row with that id. |
| `409` | `SUPPORT_ACCESS_ALREADY_ACTIVE` | `POST /tenants/:tenantId/support-access` | This admin already holds an unexpired, unrevoked grant for this tenant. Prevents stacking overlapping sessions so the grant list stays a readable oversight record. |
| `409` | `CANNOT_DISABLE_LAST_ACTIVE_ADMIN` | `POST /admins/:adminId/disable` | The target is the only `active` admin left. No self-service admin signup exists (`PLAN.md` §2), so this would need a DBA to undo. |
| `429` | `Too Many Requests` | Any route | `ThrottlerGuard` limit exceeded for that route's tier — see the per-group throttle columns. |
| `500` | `Internal Server Error` | Any route | Unhandled exception; only `traceId` is safe to show. On `POST /tenants` this must also mean the whole four-row transaction rolled back (`PLAN.md` §8.10). |

## Security considerations

This module has the widest reach of any in the backend, and unlike every other module its
mistakes are not scoped to one tenant. The considerations below are ordered by blast radius.

- **Cross-tenant reach is the default, not an exception.** Every route here reads or writes rows
  that belong to tenants the caller has no relationship with. Nothing scopes them, because
  `tenants` and `platform_admins` have no `tenant_id` column to scope by. That is the deliberate
  consequence of `PLAN.md` §2's separate hierarchy: the invariant "every tenant-scoped query is
  single-tenant" holds everywhere *else* precisely because it is suspended here. Treat every
  endpoint in this document as operating at platform scope by construction, and never add a route
  that reads tenant *content* without a support-access grant behind it.
- **Token-type confusion is the highest-severity failure available.** Three payload shapes now
  exist — `tenant_user`, `platform_admin`, `support_access` — and auth's api-reference already
  names trusting `tenantId` without first checking `type` the worst mistake in its module. Two
  directions matter here. A `platform_admin` token reaching a tenant-scoped route arrives with
  `tenantId: undefined`, and `WHERE tenant_id = $1` with `$1 = undefined` does not reliably mean
  "match nothing" across query builders. A `support_access` token reaching a platform-admin route
  becomes a full cross-tenant credential, including the power to mint grants for other tenants —
  which is why it gets its own error code rather than being folded into
  `NOT_A_PLATFORM_ADMIN`. Verify both directions in tests; do not assume either.
- **Support access is read-only because the schema cannot attribute a platform-admin write.**
  Tenant tables attribute to `users.id`; a support token's `sub` is a `platform_admins.id`. The one
  column in the whole schema referencing `platform_admins` from outside its own three tables is
  `tenants.created_by_platform_admin_id`. A write through support access would violate a foreign key
  or, worse, be misattributed to a real tenant user. Read-only is a schema fact, and it must be
  enforced as an allow-list (reject non-`GET`, reject `@Roles(...)` routes) so a write route added
  later is closed by default.
- **Support-access blast radius is bounded by TTL, not by revocation.** The token is a stateless
  JWT. `DELETE /support-access/:grantId` marks the record and stops the next mint; it does not stop
  the token in flight. The 5–60 minute TTL and the non-refreshable design are the real bound, plus
  the `409 SUPPORT_ACCESS_ALREADY_ACTIVE` rule that stops an admin from quietly holding
  overlapping sessions. Prefer the default 15 minutes; a 60-minute grant should be justified in the
  `reason`.
- **The audit trail records what changed, not who changed it.** `log_db_changes()` fires on every
  write this module makes and snapshots the row, so a suspension is captured with
  `old_value`/`new_value`. But `audit_logs`'s only actor columns are `db_user` (`session_user`),
  `db_name`, and `triggered_by` — all database-level values, identical for every application
  request through the shared pool. There is no `user_id` or `platform_admin_id` column of any kind.
  Worse for investigations, `log_db_changes()` derives `audit_logs.tenant_id` from
  `new_row->>'tenant_id'`, and `tenants` has an `id` rather than a `tenant_id`, so every audit row
  for a `tenants` write lands with `tenant_id = NULL` — a per-tenant audit query using
  `idx_audit_logs_tenant_id` silently omits that tenant's own suspension. Both are flagged in the
  overview's [Gap](./overview.md#gap-between-current-code-and-target-design) as required follow-ups,
  not accepted behaviour.
- **Reads are not audited at all.** The trigger is a write trigger. `PLAN.md` §6.1 anticipates this
  exact case — "logging a *read* rather than a write, e.g. 'a platform admin viewed this tenant's
  data'" — as the one need that would justify a narrow purpose-built table with a proper `user_id`.
  Until it exists, `GET /support-access` shows that a grant was issued and why, and nothing shows
  what was read through it. Do not describe support access as fully audited before that table
  lands.
- **Suspension latency matters operationally, not just theoretically.** `PLAN.md` §8.20 accepts
  that a suspended tenant's already-issued access tokens keep working until expiry — up to 15
  minutes. For a support workflow that means suspension is a policy action, not containment: an
  operator responding to active abuse cannot report the tenant as cut off at the moment the call
  returns, which is why `POST .../suspend` returns `accessRevokedAfter` rather than a bare success.
  And because nothing gates the review pipeline on `tenants.status`, a suspended tenant keeps
  polling and — if `tenant_settings.auto_post_enabled` is true — keeps *posting replies on the
  customer's behalf*. That is the sharper operational risk of the two, it is not covered by §8.20,
  and `pipelineHalted` reports it honestly until the pipeline filters on tenant status.
- **`reason` is required on every write route and currently persists nowhere.** Suspension,
  unsuspension, provisioning, support access, and admin disable/enable all demand it, and only
  support access will have a column to store it once the grant table lands. Collecting it now keeps
  it in the contract ahead of the storage, but do not present a suspension reason as recoverable
  from the database today — it is not.
- **Metrics must never become a data-read path.** `GET /metrics/overview` returns only counts and
  averages, and its response shape has no field that could carry row content. A "just add the
  reviewer name to the escalation metric" change would turn an unlogged, un-time-boxed endpoint
  into a cross-tenant PII read that bypasses support access entirely.
- **No hard deletes anywhere in this module.** No delete endpoint exists for a tenant or an admin.
  `invited_by_platform_admin_id` and `tenants.created_by_platform_admin_id` are both `ON DELETE SET
  NULL`, so deleting a `platform_admins` row would erase the invite lineage of everyone they
  invited and the record of which tenants they provisioned. Disable in place — the same reasoning
  `PLAN.md` §6.2 applies to `users` erasure, one hierarchy up.
- **Locking the platform out of its own admin surface is a one-way door.** There is no
  self-service platform-admin signup by design (`PLAN.md` §2 calls it a privilege-escalation hole)
  and `idx_platform_admins_single_root` allows at most one root, so a second one cannot be seeded.
  `409 CANNOT_DISABLE_LAST_ACTIVE_ADMIN` is the guard, and it must be implemented as a guarded
  conditional `UPDATE` (proceed only while another `active` admin still exists), not a read
  followed by a write — otherwise two admins disabling each other concurrently can both pass the
  check.
