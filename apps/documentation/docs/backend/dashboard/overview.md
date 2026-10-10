---
sidebar_position: 1
---

# Dashboard Module

## Overview

The dashboard module serves the four stat cards, the rating-distribution bars, and the "Needs
your attention" list on the app's landing screen. It is **read-only and owns no tables**. Every
number it returns is an aggregate over `reviews` (`0004_reviews.sql`), with the enum values those
columns take declared in `0000_foundation.sql`. There is no `dashboard_*` table, no materialized
view, and no counter column anywhere — if a figure on this screen is wrong, the bug is either in
the SQL predicate below or in the ingestion/classification pipeline that produced the rows, never
in stale denormalized state.

It exists as its own module rather than as extra routes on [the reviews
module](../reviews/overview.md) because the two have opposite shapes: the reviews module is a
write surface over a domain entity (it returns `Review` rows and mutates them — approve, edit,
dismiss), while this module returns aggregate view models assembled for one screen. Splitting
them keeps `../reviews/` honest about the entity and confines the screen-shaped aggregation here,
where it is bounded by the fact that nothing in this module writes anything.

**Implemented.** `src/api/dashboard/` (controller, service, DTOs, swagger) and
`src/db/repositories/dashboard/` (repository) both exist and are exercised by the frontend. An
earlier revision of this document (and the paired [API reference](./api-reference.md)) described
a pre-implementation target design with different field names (`stats`, `attention-reviews`,
`pendingApproval`, `initials`, `snippet`, `percentage`) — that design was never built in that
shape; what follows describes the module as it actually ships.

## Data model

No owned tables. Every figure is an aggregate over `reviews`, scoped to `tenant_id` (taken from
the JWT, never a request parameter — see the auth reference's [session/token
model](../auth/api-reference.md#session--token-model-1)):

| Metric | Columns | Predicate | Windowed? |
|---|---|---|---|
| `metrics.total` | `COUNT(*)` | `tenant_id = $t AND reviewed_at > now() - make_interval(days => $days)` | Yes |
| `metrics.avgRating` | `AVG(rating)::float` | Same as `total` | Yes |
| `metrics.pending` | `COUNT(*)` | `tenant_id = $t AND status IN ('new', 'in_review')` | No |
| `metrics.escalated` | `COUNT(*)` | Above, plus `classification = 'escalated'` | No |
| `metrics.ratingDistribution` | `COUNT(*) GROUP BY rating` | Same predicate as `metrics.total` | Yes |
| `recent-escalated` | `id, reviewer_name, rating, review_text, escalation_reason, reviewed_at` | `tenant_id = $t AND classification = 'escalated' AND status IN ('new', 'in_review')`, ordered `reviewed_at DESC, id DESC`, `LIMIT $limit` | No |

`reviewed_at`, not `created_at`, is what every windowed query filters on: `created_at` is the
row's insert time and defaults to `now()` at ingest, so an onboarding backfill would stamp a
business's entire review history with today's date — filtering on it would report years of
imported reviews as arriving in the last 7 days, and every window in the selector would return
the same number. `reviewed_at` is nullable and the `>` comparison excludes `NULL`s, which is
correct: a review with no date cannot be placed in a window.

Enum values referenced above, all from `0000_foundation.sql`:

- `review_status` — `new`, `in_review`, `responded`, `dismissed`.
- `review_classification` — `auto_reply_candidate`, `escalated`, `pending_classification`.
- `escalation_reason` — `low_rating`, `blocklist_match`.

Neither `anonymized_at` nor `removed_upstream_at` is filtered out of any aggregate here. An
anonymized row still counts toward `total`/`pending`/`escalated`/the distribution (its rating
survives anonymization — only `reviewer_name`/`review_text` are cleared) and still appears in
`recent-escalated` with those two fields `null`, since an open escalation is still work regardless
of whether the reviewer's identity has since been purged.

## Metric definitions

### `pending` and `escalated` are backlog counts, not window counts

`metrics.total` and `metrics.avgRating` answer "how much happened in the last N days." `pending`
and `escalated` answer a different question — "how much is outstanding right now" — so they
deliberately ignore `days` entirely and count by `status` alone. A review escalated three months
ago and still sitting at `status = 'new'` counts today exactly as it would have the day after it
arrived; the two figures fall as the human queue is worked, not as the calendar window slides
forward.

The two overlap: every row counted in `escalated` is also counted in `pending` (both require
`status IN ('new', 'in_review')`; `escalated` additionally requires
`classification = 'escalated'`). The client must not sum them.

### `avgRating` is InnoPeak's own average, not Google's published rating

`avgRating` is `AVG(rating)` over the reviews this system has ingested for the tenant's connected
location, inside the requested window. Google's own aggregate rating for the business
(all-time, computed by Google, reflecting reviews this system may not have imported yet or ever
will) is a different number, sourced elsewhere (the connections module's location record), and
the two will not match. This endpoint never reads or returns Google's figure.

`avgRating` is `null`, not `0`, when the window contains no reviews — the client must handle the
`null` case rather than assume a numeric default.

### Rating distribution is zero-filled and keyed by rating, not an array

`metrics.ratingDistribution` always carries all five buckets (`1`–`5`), including any bucket with
zero rows, keyed by rating as an object (`{ "1": 3, "2": 1, ... }`) rather than an array of
`{ star, count }` rows. The client indexes directly into it; there is no `percentage` field
(share-of-max normalization for a bar's CSS width) in the response — deriving a bar width from the
raw counts, if wanted, is the client's job. This used to be its own `GET /rating-distribution`
route; it was folded into `metrics` because every real caller wanted both for the same `days`
window in the same request.

### `recent-escalated` returns raw fields, not a derived projection

Unlike an earlier design for this endpoint, the shipped response has no derived/projected fields
— no computed `initials` from the reviewer's name, no truncated `snippet` of the review body. The
client receives `reviewerName` and `reviewText` in full (both nullable, `null` when the row has
been anonymized) and does any truncation or initials-derivation itself.

`escalationReason` is returned as the classifier's **stored** routing decision from the time it
was classified — not a live re-evaluation against the tenant's *current* rating threshold or
blocklist (settings changes are not retroactive, see the review-pipeline overview's
[Classification](../review-pipeline/overview.md#classification--implemented)). A review that is
both low-rated and blocklist-matched records only `blocklist_match` (the classifier checks the
blocklist first), so the badge can under-report a low-rating signal even though `rating` is
always present on the same row.

## API surface

Two `GET` routes, one response DTO each — see the [API reference](./api-reference.md) for full
request/response contracts:

| Route | Query params | Response |
|---|---|---|
| `GET /v1/dashboard/metrics` | `days` (1–365, default 7) | `MetricsDto` (includes `ratingDistribution`) |
| `GET /v1/dashboard/recent-escalated` | `limit` (1–50, default 4) | `RecentEscalatedDto[]` |

Both narrow to a tenant user in the service layer via `requireTenantUser`, with a
module-specific message (`MESSAGES.DASHBOARD.TENANT_ONLY`) rather than the generic
`TENANT_CONTEXT_REQUIRED` fallback — consistent with how the prompts and settings modules do the
same narrowing.

## Known limitations

- **Composite indexes back these queries.** `idx_reviews_tenant_id_reviewed_at (tenant_id, reviewed_at DESC, id DESC)`
  serves the newest-first lists and the windowed aggregates, and `idx_reviews_tenant_id_status_classification` serves the
  open-backlog counts (`0004_reviews.sql`). They replace Postgres combining two single-column indexes.
- **No caching.** At MVP volume — one tenant, one location, low thousands of reviews, ingestion
  writing at most once per 15 minutes — an indexed query here is single-digit milliseconds, and a
  cache would spend most of its life serving data that has not changed while adding a staleness
  question to a screen whose job is "what needs attention right now." Revisit if a tenant's review
  volume grows enough that even an indexed aggregate stops being trivial.
