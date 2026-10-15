---
sidebar_position: 2
---

# Dashboard Module — API Reference

## How to read this document

This describes the dashboard module **as it is actually implemented** —
`src/api/dashboard/` (controller, service, DTOs, swagger) and
`src/db/repositories/dashboard/` (repository). An earlier revision of this file was written
before the module existed, as a target/spec design; the field names, route paths, and metric
definitions it described (`/stats`, `/attention-reviews`, `pendingApproval`, `initials`,
`snippet`, `percentage`) never shipped in that shape and have been replaced below with what the
code actually returns.

It assumes you have read [Dashboard Module — Overview](./overview.md) for the reasoning behind
each metric's derivation. This document turns that into request/response contracts.

## Conventions

- **Base path**: `/v1/dashboard/...` (`RouteNames.DASHBOARD`).
- **Auth**: every route is `Bearer`, narrowed to a tenant user in the service layer
  (`requireTenantUser(user, MESSAGES.DASHBOARD.TENANT_ONLY)`) — there is no tenant parameter, and
  none is accepted; a client-supplied tenant id would let any authenticated user read another
  business's reviews. None of the three routes carries `@Roles(...)`, so a `member` can read them
  same as an `owner`.
- **Throttle**: no per-route override — all three fall back to the global tiers (`short`:
  30/minute, plus `medium`/`long`/`very-long`).
- **Success envelope**: `TransformInterceptor` wraps every 2xx as
  `{ statusCode, status, message, data }`. The shapes below are the inner `data`.
- **Error envelope**: `HttpExceptionFilter` + `ErrorHandlerService` produce
  `{ statusCode, status, message, error, traceId, data: null }` uniformly. See the auth
  reference's [Conventions](../auth/api-reference.md#conventions) for the full version.

## Dashboard API

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/dashboard/metrics` | Bearer | global tiers |
| `GET` | `/v1/dashboard/recent-escalated` | Bearer | global tiers |

Two endpoints, each with its own query-param shape (`days` on the first, `limit` on the second).
`/metrics` used to be two separate routes (`/metrics` and `/rating-distribution`) — they were
merged because every real caller wanted both for the same `days` window, and every request
against either one already scans the same windowed set of reviews; splitting them just meant
paying for that scan twice per page load.

### `GET /v1/dashboard/metrics`

The stat cards, plus the five-bucket rating distribution behind them. Three of the five fields
are windowed on `reviewed_at`; two are not, deliberately — see the field table.

| Query param | Type | Rules |
|---|---|---|
| `days` | integer | Optional, default `7`, min `1`, max `365`. The cap exists because `days` reaches Postgres's `make_interval()`, which raises "integer out of range" on an unbounded value — a `500` where a `400` belongs. |

`total`, `avgRating` and `ratingDistribution` are computed over `reviews` where `reviewed_at >
now() - make_interval(days => N)` for the caller's tenant — windowed on `reviewed_at` (when the
reviewer left it), not `created_at` (when the sync imported it): `created_at` defaults to the
insert time, so an onboarding backfill would stamp a decade of history with today's date and make
every window report the same count. `pending` and `escalated` are **not** windowed — they are
open-backlog counts (`status IN ('new', 'in_review')`), because "Pending approval" and open
escalations read as "how much work is outstanding right now," not "how much arrived in the last N
days."

`ratingDistribution[rating]` is `COUNT(*) GROUP BY rating` over the same windowed predicate as
`total`, so its five values sum to that same request's `total`. Always exactly five buckets,
`1`–`5`, zero-filled — the client never has to probe for an absent rating. It's an object keyed
by rating (`"1"`–`"5"`), not an array of five `{ star, count }` rows — the client indexes into it
directly rather than searching an array for the bucket it wants.

Success `200`:

```json
{
  "total": 128,
  "avgRating": 4.3,
  "pending": 6,
  "escalated": 2,
  "ratingDistribution": {
    "1": 3,
    "2": 1,
    "3": 4,
    "4": 20,
    "5": 96
  }
}
```

| Field | Type | Rules |
|---|---|---|
| `total` | integer | `COUNT(*)` of reviews whose `reviewed_at` falls inside the window. |
| `avgRating` | number \| null | `AVG(rating)` over the same window, cast to `float` (Postgres returns `numeric` — and therefore a string — over an integer column by default, which breaks a client calling `.toFixed()`). `null`, not `0`, when the window contains no reviews. |
| `pending` | integer | `COUNT(*)` where `status IN ('new', 'in_review')`. Not windowed. |
| `escalated` | integer | `COUNT(*)` where `status IN ('new', 'in_review')` **and** `classification = 'escalated'`. Not windowed. `pending` and `escalated` overlap and must not be summed — every escalated-and-open review is also counted in `pending`. |
| `ratingDistribution` | `Record<string, integer>` | `COUNT(*) GROUP BY rating` over the same window as `total`, zero-filled across keys `"1"`–`"5"`. |

Errors: `400` (`days` outside `1`–`365`), `401`, `403` (`TENANT_SUSPENDED` — see the auth
reference), `429`.

### `GET /v1/dashboard/recent-escalated`

The "Needs your attention" grid: open escalations, newest reviewed first. Selects `reviews` where
`classification = 'escalated'` and `status IN ('new', 'in_review')`, ordered by
`reviewed_at DESC, id DESC` (`id` is a `uuidv7`, so it breaks ties by creation order rather than
arbitrarily — routine after a backfill lands a whole page in the same second), limited to
`limit` rows.

**Not windowed by `days`, deliberately** — unlike the two endpoints above, this one takes no
window parameter at all. An escalation still open after 100 days needs attention *more*, not
less; bounding it by a recency window would hide the oldest, most-overdue items from the exact
screen meant to surface them.

| Query param | Type | Rules |
|---|---|---|
| `limit` | integer | Optional, default `3`, min `1`, max `50`. |

Every field is read straight off the `reviews` row — there is no derived/projected field (no
`initials`, no truncated `snippet`) in the shipped response; the client renders whatever
`reviewerName`/`reviewText` it gets. An anonymized row (`anonymized_at IS NOT NULL`) is not
hidden — an open escalation is still work — but `reviewerName` and `reviewText` come back `null`,
since the source columns are cleared by the retention purge (see the review-pipeline overview's
[Retention and erasure
jobs](../review-pipeline/overview.md#retention-and-erasure-jobs)).

Success `200`:

```json
[
  {
    "id": "0190f3b2-4c81-7d3a-9f22-6b1e8a4c0d11",
    "reviewerName": "Connor Blake",
    "rating": 2,
    "reviewText": "Reservation for 7pm, wasn't seated until 7:40 with no apology.",
    "escalationReason": "low_rating",
    "reviewedAt": "2026-03-11T18:22:04.129Z"
  },
  {
    "id": "0190f3b2-51a7-7e04-8c19-2d7f4b9e6a30",
    "reviewerName": "Marcus Yee",
    "rating": 5,
    "reviewText": "My uncle is a lawyer and even he agreed this was the best deal in town.",
    "escalationReason": "blocklist_match",
    "reviewedAt": "2026-03-10T09:14:21.884Z"
  }
]
```

The second row is the case that justifies this list existing independently of a low-rating
filter: a **5-star** review escalated by `blocklist_match` on the word "lawyer." Rating alone
would never surface it. `escalationReason` is returned rather than left for the client to infer,
since the two reasons are independent of the star rating.

No cursor or offset pagination — this is a fixed-size attention grid on a summary screen, not a
browsable list. The full, filterable, paginated queue lives in
[`../reviews/`](../reviews/overview.md).

| Field | Type | Rules |
|---|---|---|
| `id` | string (uuid) | `reviews.id`. |
| `reviewerName` | string \| null | `null` when anonymized. |
| `rating` | integer 1–5 | Always present — ratings are never cleared by anonymization. |
| `reviewText` | string \| null | `null` when anonymized. |
| `escalationReason` | `low_rating` \| `blocklist_match` \| null | The classifier's stored routing decision, not a live re-evaluation of today's threshold/blocklist settings (settings changes are not retroactive). |
| `reviewedAt` | string (ISO 8601) \| null | When the reviewer left the review, not when the row was imported. |

Errors: `400` (`limit` outside `1`–`50`), `401`, `403` (`TENANT_SUSPENDED`), `429`.

## Error reference

| Status | Code | Route(s) | When |
|---|---|---|---|
| `400` | `Validation Error` | `/metrics` | `days` present but outside `1`–`365`. |
| `400` | `Validation Error` | `/recent-escalated` | `limit` present but outside `1`–`50`. |
| `401` | `Unauthorized` | All | Missing, malformed, or expired access token. |
| `403` | `Forbidden` | All | Authenticated as a `platform_admin` token, not a tenant user (`requireTenantUser`, message "Dashboard analytics are only available to tenant users." — a plain string, not a machine-readable code; this module's errors carry no `code` field, unlike the connections module's). |
| `403` | `Forbidden` (`TENANT_SUSPENDED`) | All | `tenants.status = 'suspended'`. Takes effect on the next login/refresh, not instantly — an access token issued before the suspension keeps working for its remaining lifetime. |
| `429` | `Too Many Requests` | All | Global `ThrottlerGuard` tier exceeded. |
| `500` | `Internal Server Error` | All | Unhandled exception. Only `traceId` is safe to show the user. |

Deliberately absent:

- **No `404`.** Nothing here is addressed by id. A tenant with no reviews at all is a `200` with
  `total: 0`, `avgRating: null`, five zero-count distribution buckets, and an empty array — never
  an error.
- **No `409`, no `422`.** No writes, no state transitions to conflict with.
