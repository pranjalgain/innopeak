---
sidebar_position: 2
---

# Admin Overview Module — API Reference

## How to read this document

This describes the admin-overview module **as it is actually implemented** —
`src/api/admin/controllers/admin-overview.controller.ts`,
`src/api/admin/services/admin-overview.service.ts`,
`src/api/admin/swagger/admin-overview.swagger.ts`, the `dto/` classes it returns, and
`AdminOverviewDbService` + `AdminOverviewRepository` under `src/db/repositories/admin-overview/`.
Unlike [Platform Admin](../platform-admin/api-reference.md) or the original draft of
[Prompts](../prompts/api-reference.md), nothing here is a pre-implementation target design — every
route, field, and default below is read straight off shipped code.

It assumes you have read [Admin Overview Module — Overview](./overview.md) for the reasoning
behind the "needs attention" priority order, the signup-trend zero-fill, and why the module reads
but never writes `platform_activity_log`. Those narratives are not repeated here — this document
turns them into request/response contracts.

## Conventions

- **Base path**: `/v1/admin/overview/...` — `RouteNames.ADMIN_OVERVIEW` ('admin/overview'),
  `version: '1'` on the controller. Every sub-path (`stats`, `recent-businesses`,
  `needs-attention`, `signup-trend`, `activity`) is its own `RouteNames` entry, never a raw string.
- **Auth column**: `Bearer, platform admin`. Every route in this controller carries
  `@Roles(JwtTokenType.PLATFORM_ADMIN)`, and `RolesGuard`'s `JwtTokenType.PLATFORM_ADMIN` branch is
  checked independently of (and before) its tenant-`UserRole` branch — a `tenant_user` token fails
  closed here the same way a `platform_admin` token fails closed on an `@Roles(UserRole.OWNER)`
  route. There is no tenant-scoped variant of any route in this module: none of the underlying
  queries filter by `tenant_id` at all, so there is nothing for a tenant token to be safely scoped
  to even if it were accepted.
- **Service-layer re-check**: every handler also calls
  `requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY)` before touching the DB service. Per its
  own doc comment this "should never actually throw in practice" — `RolesGuard` already rejected
  anything else — and exists purely so the rest of the method can read `actor.id`/`actor.email` as
  facts the type system guarantees, the same reasoning `requireTenantUser` documents for tenant
  routes elsewhere in this backend.
- **Throttle**: no route in this controller carries a `@Throttle()` override, so all six fall back
  to the global `short` tier — 30 requests/minute, shared with every other unthrottled route in the
  app (`ThrottlerModule.forRoot`, `app.module.ts`).
- **Envelopes**: success payloads shown below are the *inner* `data` — `TransformInterceptor` wraps
  every 2xx as `{ statusCode, status, message, data }`. Every non-2xx is
  `{ statusCode, status, message, error, traceId, data: null }` via `HttpExceptionFilter` +
  `ErrorHandlerService`. See the auth reference's [Conventions](../auth/api-reference.md#conventions)
  for the full version with worked envelope examples.
- **Timestamps** are ISO 8601 UTC strings. **Ids** are `uuidv7()` values.

## Overview stats

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/admin/overview/stats` | Bearer, platform admin | global `short` tier (30/min) |

### `GET /v1/admin/overview/stats`

The four figures behind the Overview page's stat cards, composed from three otherwise-unrelated
sources — `AdminBusinessesDbService.count()`, `AdminUsersDbService.count()`, and
`AdminOverviewRepository.getReviewStats()` — none of which has its own reason to expose this
particular grouping on its own. No query params; the figures are always platform-wide totals, never
windowed.

Fetched via `Promise.allSettled`, not `Promise.all`: each of the three sources fails independently.
A rejected source is logged (`AdminOverviewDbService`, `warn` level) and defaults to `0` (or
`{ totalReviewsFetched: 0, totalRepliesSent: 0 }` for the review-stats source) rather than failing
the whole request — one slow/broken source degrades its own stat card to zero instead of turning
the entire response into a `500` and blanking every card.

Success `200`:

```json
{
  "businessCount": 128,
  "userCount": 412,
  "totalReviewsFetched": 4821,
  "totalRepliesSent": 3660
}
```

| Field | Type | Rules |
|---|---|---|
| `businessCount` | integer | `COUNT(*)` over `tenants` — every tenant, `pending_activation` and `suspended` included |
| `userCount` | integer | `COUNT(*)` over `users WHERE anonymized_at IS NULL`, across every tenant |
| `totalReviewsFetched` | integer | `COUNT(*)` over `reviews`, platform-wide, no `tenant_id` filter |
| `totalRepliesSent` | integer | `COUNT(*)` over `review_responses WHERE status = 'posted'` — only replies that actually reached Google. `approved` (awaiting post) and `post_failed` (Google rejected it) are deliberately excluded, unlike [`GET /v1/prompts/:promptId/stats`](../prompts/api-reference.md#get-v1promptspromptidstats)'s `approvedCount`, which folds `post_failed` in — that endpoint measures human approval, this one measures what actually shipped |

Errors: `401`, `403`, `429`.

## Recent businesses & needs attention

Both routes return the same `AdminBusinessResponseDto[]` shape and underlying `tenants` columns as
[`GET /v1/admin/businesses`](../admin-management/api-reference.md#get-v1adminbusinesses) (the Super
Admin Businesses management screen's own listing endpoint) — this module only asks for a smaller,
differently-filtered page of the same rows, via `AdminBusinessesRepository.findRecent` and
`.findNeedingAttention` rather than its `.findAll`.

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/admin/overview/recent-businesses` | Bearer, platform admin | global `short` tier (30/min) |
| `GET` | `/v1/admin/overview/needs-attention` | Bearer, platform admin | global `short` tier (30/min) |

### `GET /v1/admin/overview/recent-businesses`

The newest tenants, newest first, capped at `limit` — the Overview page's "Recent Businesses" card.

| Query param | Type | Rules |
|---|---|---|
| `limit` | integer | optional, default `5`, min `1`, max `50`. Example: `5` |

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
    "createdAt": "2026-09-11T09:00:00.000Z"
  },
  {
    "id": "0190f4c1-88ba-7a55-8410-6d3f9e0c7722",
    "name": "Northside Dental",
    "status": "active",
    "connectionStatus": "never_connected",
    "ownerName": "Ravi Menon",
    "ownerEmail": "ops@northsidedental.com",
    "userCount": 1,
    "createdAt": "2026-09-08T16:40:51.002Z"
  }
]
```

| Field | Type | Rules |
|---|---|---|
| `[].id` | string (uuid) | `tenants.id` |
| `[].name` | string | `tenants.name` |
| `[].status` | enum | `active` \| `suspended`. Display-only `BusinessStatus`, which collapses the real 3-value `tenant_status`'s `pending_activation` into `active` — a tenant mid-onboarding is not suspended, which is the only distinction this list needs to show |
| `[].connectionStatus` | enum | `connected` \| `needs_reauth` \| `disconnected` \| `never_connected` — see [Overview § Needs attention](./overview.md#needs-attention-priority-order-is-deliberate-not-just-not-connected) for what distinguishes the last two |
| `[].ownerName` / `[].ownerEmail` | string | The tenant's earliest-created, non-anonymized `role = 'owner'` user. Empty string, not `null`, in the one case a tenant's owner has been anonymized separately from the tenant itself — the product has no path there today, but the query can still return it |
| `[].userCount` | integer | Non-anonymized `users` rows for this tenant |
| `[].createdAt` | string (ISO) | `tenants.created_at` |

Errors: `400` validation (`limit` non-integer or outside 1–50), `401`, `403`, `429`.

### `GET /v1/admin/overview/needs-attention`

Non-connected tenants — `disconnected`, `needs_reauth`, or `never_connected` — ranked most-urgent
first and capped at `limit`. The priority order (a lost connection outranks a stalled re-auth,
which outranks a tenant that never finished onboarding) is a deliberate design choice, not simply
"whatever is newest and not connected" — see [Overview § Needs attention priority
order](./overview.md#needs-attention-priority-order-is-deliberate-not-just-not-connected) for why a
naive recency ordering made this panel useless in practice. A tenant with `connectionStatus:
"connected"` never appears in this response at all.

| Query param | Type | Rules |
|---|---|---|
| `limit` | integer | optional, default `3`, min `1`, max `50`. Example: `3` |

Success `200`:

```json
[
  {
    "id": "0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f",
    "name": "Oak & Iron Hardware",
    "status": "active",
    "connectionStatus": "disconnected",
    "ownerName": "Priya Shah",
    "ownerEmail": "priya@oakandiron.com",
    "userCount": 2,
    "createdAt": "2026-08-02T09:00:00.000Z"
  },
  {
    "id": "0190f4d2-33cc-7f11-9a22-5b8e1c0d6644",
    "name": "Lakeside Dental Group",
    "status": "active",
    "connectionStatus": "needs_reauth",
    "ownerName": "Tom Becker",
    "ownerEmail": "tom@lakesidedental.com",
    "userCount": 3,
    "createdAt": "2026-07-19T14:22:10.500Z"
  }
]
```

Same field shape as [`GET /recent-businesses`](#get-v1adminoverviewrecent-businesses) above; an
empty array means nothing needs attention right now, which is also what the frontend uses to decide
whether to reserve layout space for the panel at all
(`AdminOverviewView`: `showNeedsAttention = needsAttention.length > 0`).

Errors: `400` validation (`limit` non-integer or outside 1–50), `401`, `403`, `429`.

## Signup trend

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/admin/overview/signup-trend` | Bearer, platform admin | global `short` tier (30/min) |

### `GET /v1/admin/overview/signup-trend`

Tenant signup counts bucketed by calendar month (UTC), over the trailing `months` months
(inclusive of the current one), oldest first. **Every month in the window is present, including
zero-signup ones** — the repository only returns months that had at least one signup, and the
service fills the rest before responding. See [Overview § Signup trend is
zero-filled](./overview.md#signup-trend-is-zero-filled-in-the-service-not-the-repository) for why
that filling happens server-side rather than being left to the chart.

| Query param | Type | Rules |
|---|---|---|
| `months` | integer | optional, default `6`, min `1`, max `24`. How many trailing calendar months to include, counting back from the current one (inclusive). Example: `6` |

Success `200`:

```json
[
  { "monthKey": "2026-04", "count": 3 },
  { "monthKey": "2026-05", "count": 0 },
  { "monthKey": "2026-06", "count": 5 },
  { "monthKey": "2026-07", "count": 2 },
  { "monthKey": "2026-08", "count": 8 },
  { "monthKey": "2026-09", "count": 4 }
]
```

| Field | Type | Rules |
|---|---|---|
| `[].monthKey` | string | `YYYY-MM`, zero-padded, UTC calendar month |
| `[].count` | integer | Tenants created that month. `0` is a normal, expected value — not an omitted month |

Errors: `400` validation (`months` non-integer or outside 1–24), `401`, `403`, `429`.

## Recent activity

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/admin/overview/activity` | Bearer, platform admin | global `short` tier (30/min) |

### `GET /v1/admin/overview/activity`

The newest rows from `platform_activity_log`, newest first, capped at `limit` — the Overview page's glance feed. See
[Overview § Recent activity](./overview.md#recent-activity-one-log-one-source). `platform_activity_log` is a
purpose-built log of a fixed set of event types (business suspend/reactivate, erasure requested/cancelled/erased, a new
business joining, platform settings changes, admin invite send/revoke, admin enable/disable, tenant-user
activate/deactivate), written explicitly by the services that perform those actions rather than trigger-populated — see
[Overview § Activity log](./overview.md#activity-log-a-purpose-built-write-not-a-generic-audit-trail).

| Query param | Type | Rules |
|---|---|---|
| `limit` | integer | optional, default `8`, min `1`, max `50`. Example: `8` |

`businessName` and `email` are mutually exclusive per entry — which one is populated depends on
`type`; `details` is set only for `platform_settings_changed`. `actorEmail` is always present: the platform admin, the
owner's email for `business_joined`, the label `owner (self-service)` for an owner's own erasure request or cancellation, or the system actor for the nightly erasure:

Success `200`:

```json
[
  {
    "id": "0190f3c1-2a88-70c5-8d19-6b2e4f7a9c33",
    "type": "business_joined",
    "actorEmail": "maria@coastaltable.com",
    "businessName": "The Coastal Table",
    "email": null,
    "details": null,
    "occurredAt": "2026-09-11T09:12:00.000Z"
  },
  {
    "id": "0190f3c2-3b99-70c5-8d19-6b2e4f7a9c44",
    "type": "platform_settings_changed",
    "actorEmail": "admin@innopeak.com",
    "businessName": null,
    "email": null,
    "details": { "changes": [{ "field": "googleLoginEnabled", "from": true, "to": false }] },
    "occurredAt": "2026-09-11T08:30:00.000Z"
  },
  {
    "id": "0190f3b4-1a88-70c5-8d19-6b2e4f7a9c33",
    "type": "business_suspended",
    "actorEmail": "admin@innopeak.com",
    "businessName": "Oak & Iron Hardware",
    "email": null,
    "occurredAt": "2026-09-10T09:12:00.000Z"
  },
  {
    "id": "0190f3b5-2c00-71a4-8e21-9d3f5a0c1188",
    "type": "admin_invite_sent",
    "actorEmail": "admin@innopeak.com",
    "businessName": null,
    "email": "priya.ops@innopeak.com",
    "occurredAt": "2026-09-10T15:40:22.310Z"
  }
]
```

| Field | Type | Rules |
|---|---|---|
| `[].id` | string (uuid) | `platform_activity_log.id` |
| `[].type` | enum | `business_suspended` \| `business_reactivated` \| `business_erasure_requested` \| `business_erasure_cancelled` \| `business_erased` \| `business_joined` \| `platform_settings_changed` \| `admin_invite_sent` \| `admin_invite_revoked` \| `admin_disabled` \| `admin_enabled` \| `user_activated` \| `user_deactivated` (`platform_activity_type`) |
| `[].actorEmail` | string | Snapshotted at write time from the acting admin's `AuthUser` (or the owner's address, the self-service label, or the system actor), not joined from `platform_admins` — survives that admin's row being deleted |
| `[].details` | object \| null | Only `platform_settings_changed`: `{ changes: [{ field, from, to }], lockoutConfirmed? }`. `field` is the platform setting's API name; `lockoutConfirmed` is present when the admin confirmed switching a provider off although users could then only sign in with it. `null` for every other type |
| `[].businessName` | string \| null | Set (non-null) for the `business_*` types (including `business_joined`) and `user_activated` / `user_deactivated`; `null` otherwise. Snapshotted, not joined from `tenants`, so a later rename or deletion doesn't retroactively rewrite what a past entry says happened |
| `[].email` | string \| null | Set (non-null) only for `admin_invite_sent` / `admin_invite_revoked` / `admin_disabled` / `admin_enabled` / `user_activated` / `user_deactivated`; `null` otherwise |
| `[].occurredAt` | string (ISO) | `platform_activity_log.occurred_at` |

There is no `404`/empty-state error for a platform with no logged activity yet — an empty array is
a normal response, rendered by `ActivityLogCard` as its own "nothing yet" copy rather than treated
as a fault.

Errors: `400` validation (`limit` non-integer or outside 1–50), `401`, `403`, `429`.

## Activity log

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/admin/overview/activity-log` | Bearer, platform admin | global `short` tier (30/min) |

### `GET /v1/admin/overview/activity-log`

The same `platform_activity_log` rows `GET /activity` above reads, but paginated and filterable by
`type` rather than a bounded top-`limit` read — backs the dedicated Activity page's "Platform
activity" tab, distinct from the Overview page's small glance card.

| Query param | Type | Rules |
|---|---|---|
| `page` | integer | optional, default `1`, min `1`. Example: `1` |
| `pageSize` | integer | optional, default `20`, min `1`, max `100`. Example: `20` |
| `type` | enum | optional, one of the `platform_activity_type` values listed above. Example: `business_suspended` |

Success `200`:

```json
{
  "activities": [
    {
      "id": "0190f3b4-1a88-70c5-8d19-6b2e4f7a9c33",
      "type": "business_suspended",
      "actorEmail": "admin@innopeak.com",
      "businessName": "Oak & Iron Hardware",
      "email": null,
      "details": null,
      "occurredAt": "2026-09-11T09:12:00.000Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

Same per-entry field shape as [`GET /activity`](#get-v1adminoverviewactivity) above. `meta` is the shared `PaginationMetaDto` — `{ page, pageSize, total,
totalPages }`.

Errors: `400` validation (`type` not one of the listed values, `page`/`pageSize` non-integer or out
of range), `401`, `403`, `429`.

## Error reference

Every row uses the shared error envelope described in [Conventions](#conventions).

| Status | Code | Route(s) | When |
|---|---|---|---|
| `400` | `Validation Error` | Any route with a `limit`/`months` query param | A `class-validator` rule failed — non-integer, or outside the route's own min/max. `message` is the comma-joined list of violations. |
| `401` | `Unauthorized` | Every route | Missing, malformed, or expired access token. |
| `403` | `Forbidden` | Every route | In practice always `RolesGuard` rejecting a token whose `type` isn't `platform_admin` (the generic "Forbidden resource" shape) — that guard runs ahead of the controller, so a non-platform-admin request never actually reaches the handler. `requirePlatformAdmin`'s own `403 PLATFORM_ADMIN_ONLY` inside each service method is defense-in-depth for the same condition and, per its own doc comment, "should never actually throw in practice" while every route here keeps `@Roles(JwtTokenType.PLATFORM_ADMIN)`. |
| `429` | `Too Many Requests` | Any route | The global `short` tier (30/min) exceeded — no route in this module has its own override. |
| `500` | `Internal Server Error` | Any route | Unhandled exception. Only `traceId` is safe to surface; detail stays server-side per `ErrorHandlerService.handleUnhandledError`. |

One failure mode that is **not** an error on this surface: an admin action's activity-log entry
failing to write. `AdminOverviewDbService.recordActivityBestEffort` swallows that failure (logged at
error level) rather than surfacing it — see [Overview § Activity
log](./overview.md#activity-log-a-purpose-built-write-not-a-generic-audit-trail) for why. Nothing in
this document's routes ever returns an error because of it; the only symptom is a missing entry the
next time `GET /activity` is called.
