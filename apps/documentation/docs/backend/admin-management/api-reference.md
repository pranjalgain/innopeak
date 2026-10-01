---
sidebar_position: 2
---

# Admin Management Module — API Reference

## How to read this document

This describes the admin-management module **as it is actually implemented** —
`src/api/admin/controllers/admin-businesses.controller.ts` + `admin-users.controller.ts`,
`src/api/admin/services/admin-businesses.service.ts` + `admin-users.service.ts`, the `dto/`
classes they return, and `AdminBusinessesDbService`/`AdminBusinessesRepository` +
`AdminUsersDbService`/`AdminUsersRepository` under `src/db/repositories/`. Every route, field, and
default below is read straight off shipped code — **this is not the [Platform Admin
Module](../platform-admin/api-reference.md)'s speculative target design**, which describes an
unbuilt, unrelated act-as-token system under the same `/v1/platform-admin/...` prefix name; the
routes below live at `/v1/admin/businesses` and `/v1/admin/users` instead.

It assumes you have read [Admin Management Module — Overview](./overview.md) for why search moved
server-side and why the Businesses and Users lists needed different SQL to do it.

## Conventions

- **Base path**: `/v1/admin/businesses/...` (`RouteNames.ADMIN_BUSINESSES`) and
  `/v1/admin/users/...` (`RouteNames.ADMIN_USERS`), both `version: '1'`.
- **Auth column**: `Bearer, platform admin`. Every route on both controllers carries
  `@Roles(JwtTokenType.PLATFORM_ADMIN)`; a `tenant_user` token fails closed. Every handler also
  re-checks via `requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY)` in the service layer.
- **Throttle**: list routes fall back to the global `short` tier (30/min, no override). The plain
  write routes (`POST .../status`, `POST .../toggle-active`) carry
  `@Throttle({ short: { limit: 20, ttl: 60000 } })` — tighter than the global default, since a
  mis-scripted loop against a status-flip endpoint is worth capping harder than a read. The two
  erasure routes (`POST .../request-erasure`, `POST .../cancel-erasure`) are tighter still —
  `@Throttle({ short: { limit: 10, ttl: 60000 } })` — since they gate an irreversible, GDPR-facing
  action rather than a reversible status flip.
- **Envelopes**: success payloads shown below are the *inner* `data` — `TransformInterceptor` wraps
  every 2xx as `{ statusCode, status, message, data }`. See the auth reference's
  [Conventions](../auth/api-reference.md#conventions) for the full envelope shape.
- **Timestamps** are ISO 8601 UTC strings. **Ids** are `uuidv7()` values.

## Businesses

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/admin/businesses` | Bearer, platform admin | global `short` tier (30/min) |
| `POST` | `/v1/admin/businesses/:tenantId/status` | Bearer, platform admin | 20/min |
| `POST` | `/v1/admin/businesses/:tenantId/request-erasure` | Bearer, platform admin | 10/min |
| `POST` | `/v1/admin/businesses/:tenantId/cancel-erasure` | Bearer, platform admin | 10/min |

### `GET /v1/admin/businesses`

Every tenant, newest first, optionally narrowed by `search` — see [Overview § Server-side
search](./overview.md#server-side-search-why-and-why-the-two-lists-needed-different-sql) for what
it matches against and why the owner-name half needs an `EXISTS` subquery. No pagination — see
[Known limitations](./overview.md#known-limitations).

| Query param | Type | Rules |
|---|---|---|
| `search` | string | optional, ≤200 chars. Case-insensitive substring match against the tenant name or its owner name. Example: `coastal` |

Success `200`:

```json
[
  {
    "id": "0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f",
    "name": "The Coastal Table",
    "status": "active",
    "connectionStatus": "connected",
    "ownerName": "Maria Delgado",
    "ownerEmail": "maria@coastaltable.com",
    "userCount": 4,
    "createdAt": "2025-11-02T09:00:00.000Z",
    "erasureRequestedAt": null
  }
]
```

| Field | Type | Rules |
|---|---|---|
| `[].status` | enum | `active` \| `suspended` \| `erased` — collapses the real 4-value `tenant_status`'s `pending_activation` into `active`; `suspended` also covers a tenant mid-erasure-grace-period (see `erasureRequestedAt` below), and `erased` only appears once the nightly erasure-purge cron has actually finished anonymizing the tenant |
| `[].erasureRequestedAt` | string (ISO) \| null | Set once a platform admin has called `request-erasure` on this tenant; `null` means no erasure is pending. Combine with `ERASURE_GRACE_PERIOD_DAYS` to compute when it takes effect — see [Overview § Tenant erasure](./overview.md#tenant-erasure-request-and-cancel-platform-admin-only-not-tenant-self-service) |
| `[].connectionStatus` | enum | `connected` \| `needs_reauth` \| `disconnected` \| `never_connected` — same derivation as [Admin Overview's Recent Businesses](../admin-overview/api-reference.md#get-v1adminoverviewrecent-businesses) |
| `[].ownerName` / `[].ownerEmail` | string | The tenant's earliest-created, non-anonymized `role = 'owner'` user. Empty string in the one case a tenant's owner was anonymized separately from the tenant itself |
| `[].userCount` | integer | Non-anonymized `users` rows for this tenant |

Errors: `400` validation (`search` over 200 chars), `401`, `403`, `429`.

### `POST /v1/admin/businesses/:tenantId/status`

Suspends or reactivates a tenant. Reactivating always lands the real `tenant_status` on `active`,
never back on `pending_activation` — proceeding to normal operation, not un-suspending into an
onboarding state the tenant may have left long ago. Records a `business_suspended` /
`business_reactivated` entry to `platform_activity_log` on success (best-effort — see [Admin
Overview's own note](../admin-overview/overview.md#activity-log-a-purpose-built-write-not-a-generic-audit-trail)
on why a logging failure never fails the action).

Request body:

```json
{ "status": "suspended" }
```

| Field | Type | Rules |
|---|---|---|
| `tenantId` | string (path, uuid) | required |
| `status` | enum | `active` \| `suspended` |

Success `200`: the same `AdminBusinessResponseDto` shape as the list above, reflecting the new
status.

Errors: `400` validation, `401`, `403`, `404` `BUSINESS_NOT_FOUND`, `409`
`BUSINESS_ERASURE_PENDING` (this tenant has a pending erasure request — see [Overview § Tenant
erasure](./overview.md#tenant-erasure-request-and-cancel-platform-admin-only-not-tenant-self-service);
cancel it first via `cancel-erasure`), `429`.

### `POST /v1/admin/businesses/:tenantId/request-erasure`

Starts the grace-period clock on a tenant's erasure. Immediately sets the tenant's real
`tenant_status` to `suspended` and stamps `erasure_requested_at` — every user in the tenant loses
access now, exactly as a plain suspend would, but nothing is anonymized yet. Anonymization happens
later, in the nightly erasure-purge cron job, once the configured grace period elapses; cancellable
any time before then via `cancel-erasure`. See [Overview § Tenant
erasure](./overview.md#tenant-erasure-request-and-cancel-platform-admin-only-not-tenant-self-service)
for the full design (why `suspended` is reused, the advisory-lock coordination with the cron, and
the activity-log lifecycle). Records a `business_erasure_requested` entry to
`platform_activity_log` on success.

No request body.

| Field | Type | Rules |
|---|---|---|
| `tenantId` | string (path, uuid) | required |

Success `200`: the same `AdminBusinessResponseDto` shape as the list above (`erasureRequestedAt`
now set, `status` now `suspended`). The envelope's `message` embeds the configured grace period,
e.g.:

```
"Erasure requested. Every user in this business loses access now, and their data is permanently
erased in 21 days unless you cancel first."
```

Errors: `401`, `403`, `404` `BUSINESS_NOT_FOUND` (no such tenant, or the tenant is already fully
`erased` — both collapse to the same not-found response), `429`.

### `POST /v1/admin/businesses/:tenantId/cancel-erasure`

Undoes `request-erasure` — a clean, full undo, since nothing is anonymized until the grace period
actually elapses. Sets `tenant_status` back to `active` and clears `erasure_requested_at`. Runs
inside a transaction holding a per-tenant Postgres advisory lock
(`pg_advisory_xact_lock(hashtext('gdpr:tenant-erasure'), hashtext(tenantId))`) — the same lock key
the nightly erasure-purge cron job takes before anonymizing that tenant's users, which is what
prevents this from racing a purge already in progress for the same tenant. Refuses to run on a
tenant that has no pending erasure request, or one that is already fully `erased` (its
`erasure_requested_at` intentionally survives erasure as a historical record, so that alone can't
mean "cancellable" — see the Overview section linked above). Records a
`business_erasure_cancelled` entry to `platform_activity_log` on success.

No request body.

| Field | Type | Rules |
|---|---|---|
| `tenantId` | string (path, uuid) | required |

Success `200`: the same `AdminBusinessResponseDto` shape as the list above (`erasureRequestedAt`
now `null`, `status` back to `active`).

Errors: `401`, `403`, `404` `BUSINESS_NOT_FOUND` (no such tenant, no pending erasure request on it,
or it's already fully `erased`), `429`.

## Users

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/admin/users` | Bearer, platform admin | global `short` tier (30/min) |
| `POST` | `/v1/admin/users/:userId/toggle-active` | Bearer, platform admin | 20/min |

### `GET /v1/admin/users`

Every non-anonymized user across every tenant, newest first, optionally narrowed by `search` — see
[Overview § Server-side
search](./overview.md#server-side-search-why-and-why-the-two-lists-needed-different-sql) for what
it matches against. No pagination — see [Known limitations](./overview.md#known-limitations).

| Query param | Type | Rules |
|---|---|---|
| `search` | string | optional, ≤200 chars. Case-insensitive substring match against the user name or their business name. Example: `jane` |

Success `200`:

```json
[
  {
    "id": "0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f",
    "businessId": "0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f",
    "businessName": "The Coffee House",
    "name": "Jane Doe",
    "email": "jane@thecoffeehouse.com",
    "role": "owner",
    "isActive": true,
    "lastLoginAt": "2026-03-01T09:12:00.000Z"
  }
]
```

| Field | Type | Rules |
|---|---|---|
| `[].isActive` | boolean | Derived from `users.status`: `true` only when it's exactly `active` |
| `[].lastLoginAt` | string (ISO) \| null | Most recent `refresh_tokens` issuance for this user — there is no dedicated `last_login_at` column. `null` means no session was ever issued |

Errors: `400` validation (`search` over 200 chars), `401`, `403`, `429`.

### `POST /v1/admin/users/:userId/toggle-active`

A single toggle, not separate activate/deactivate calls: any status other than `disabled` flips to
`disabled`, and `disabled` flips back to whatever it must have been — `active` if the user's email
was ever verified, otherwise `pending_verification`, so disabling an unverified signup never
doubles as verifying them. Records a `user_deactivated` / `user_activated` entry to
`platform_activity_log` on success, naming both the person and their business (an email alone is
ambiguous on a feed spanning every tenant).

| Field | Type | Rules |
|---|---|---|
| `userId` | string (path, uuid) | required |

Success `200`: the same `AdminUserResponseDto` shape as the list above, reflecting the new status.

Errors: `401`, `403`, `404` `ADMIN_USER_NOT_FOUND`, `409` `USER_REMOVAL_PENDING` (this user has a
pending team-member-removal request in progress — see [Overview § Admin user toggle-active vs. a
pending team-member
removal](./overview.md#admin-user-toggle-active-vs-a-pending-team-member-removal); cancel it
first via the settings module's own removal flow), `429`.

## Error reference

| Status | Code | Route(s) | When |
|---|---|---|---|
| `400` | `Validation Error` | Any route with a query/body DTO | A `class-validator` rule failed. |
| `401` | `Unauthorized` | Every route | Missing, malformed, or expired access token. |
| `403` | `Forbidden` | Every route | `RolesGuard` rejecting a token whose `type` isn't `platform_admin`. |
| `404` | `BUSINESS_NOT_FOUND` | `POST /businesses/:tenantId/status`, `.../request-erasure`, `.../cancel-erasure` | No `tenants` row with that id (or, for the two erasure routes, no row matching the extra state the operation requires — see each route's own entry above). |
| `404` | `ADMIN_USER_NOT_FOUND` | `POST /users/:userId/toggle-active` | No `users` row with that id. |
| `409` | `BUSINESS_ERASURE_PENDING` | `POST /businesses/:tenantId/status` | This tenant has a pending erasure request; plain suspend/reactivate is blocked until it's cancelled. |
| `409` | `USER_REMOVAL_PENDING` | `POST /users/:userId/toggle-active` | This user has a pending team-member-removal request; the toggle is blocked until it's cancelled. |
| `429` | `Too Many Requests` | Any route | The route's own throttle tier exceeded. |
| `500` | `Internal Server Error` | Any route | Unhandled exception. Only `traceId` is safe to surface. |
