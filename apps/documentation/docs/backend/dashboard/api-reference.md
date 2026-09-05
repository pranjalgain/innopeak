---
sidebar_position: 2
---

# Dashboard Module — API Reference

## How to read this document

This is the **target/spec design** for the dashboard module's HTTP surface. Unlike the auth
module, which has boilerplate code to adapt, **none of this module exists in
`apps/backend/src/` today** — there is no `src/api/dashboard/`, no
`src/db/repositories/dashboard/`, and no `RouteNames.DASHBOARD`. Every route below is net-new;
see the overview's [Gap](./overview.md#gap-between-current-code-and-target-design).

It assumes you have read [Dashboard Module — Overview](./overview.md), which is where each
metric's derivation, the enum values it filters on, and the missing indexes it needs are worked
out. This document does not repeat that reasoning; it turns it into request/response contracts.
Where a derivation decision matters for reading a contract, it is cited back to the overview
rather than restated.

Intentionally HTTP-contract-level only — no controller or decorator code. When implementing a
route below it lives under `src/api/dashboard/` per
`apps/backend/docs/conventions/module-structure.md`: the JSON shown here is what that route's
Swagger decorator (in `swagger/dashboard.swagger.ts`) should render as its example, every DTO
property backing it carries an `example`, and each success `message` comes from
`src/common/constants/messages.constants.ts` — **a file that does not exist yet**, flagged as a
prerequisite by the auth module too — never an inline literal.

The JSON examples use the values the frontend's fixtures render today
(`apps/web/src/app/_libs/mock-data/dashboard-stats.ts`, at the default `30d` range), so a
response can be diffed against the mock the UI was built on.

## Conventions

- **Base path**: `/v1/dashboard/...` (`RouteNames.DASHBOARD`, `version: '1'` in
  `@Controller()`). The enum member needs adding to `src/common/route-names.ts`.
- **Auth column**: every route is `Bearer` — `Authorization: Bearer <access_token>`, or the
  equivalent `sid` cookie, which `CookieAuthMiddleware` promotes into the header before the
  guards run. No route here is `@Public()`, and none carries `@Roles(...)`.
- **Tenant scoping**: `tenant_id` comes from the JWT, never from a query parameter or body.
  Every route requires `type === 'tenant_user'` before trusting it — see the auth reference's
  [session/token model](../auth/api-reference.md#session--token-model-1).
- **Throttle**: all three routes fall back to the global `short` tier (30 requests/minute); no
  route needs an override. See [Caching and cost](#caching-and-cost) for why that is comfortable
  even though the screen fires three requests per range change.
- **Success envelope**: `TransformInterceptor` wraps every 2xx as
  `{ statusCode, status, message, data }`. The shapes below are the inner `data`.
- **Error envelope**: `HttpExceptionFilter` + `ErrorHandlerService` produce
  `{ statusCode, status, message, error, traceId, data: null }` uniformly.

Both envelopes are defined by `src/common/dto/api-response.ts`. For the full version — the exact
envelope fields, cookie promotion, guard order, validation-error collapsing — see the auth
reference's [Conventions](../auth/api-reference.md#conventions) rather than a second copy here.

## Dashboard API

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/dashboard/stats` | Bearer | 30 / min |
| `GET` | `/v1/dashboard/rating-distribution` | Bearer | 30 / min |
| `GET` | `/v1/dashboard/attention-reviews` | Bearer | 30 / min |

Three endpoints rather than one combined `GET /v1/dashboard`, even though
`use-dashboard-stats.ts` fetches all three together in a single `Promise.all` and shows one
loading state for the whole screen. A combined endpoint would be one round trip and — more
usefully — one consistent snapshot, since a 15-minute sync landing between calls can leave the
`escalatedOpen` card disagreeing with the attention grid beneath it. Three are specified anyway
because they have genuinely different cache and parameter shapes (`range` on two, `limit` on the
third, and the attention list is not range-bounded at all), and because the two aggregate
endpoints are the ones a future non-dashboard consumer would want on their own. The read-skew
window is seconds wide, cosmetic, and self-corrects on the next fetch. Revisit if a
single-snapshot guarantee ever becomes a real requirement — that is the argument that would win,
not round-trip count.

### `GET /v1/dashboard/stats`

The four stat cards. Returns one object with all four figures plus an echo of the resolved
range, computed over `reviews` (and, for `pendingApproval`, an `EXISTS` probe into
`review_responses`) for the caller's tenant.

Each field, in one line — full derivations in the overview's [Metric
definitions](./overview.md#metric-definitions):

- **`reviewCount`** — `COUNT(*)` of `reviews` in the window.
- **`averageRating`** — `AVG(rating)` over the same rows, rounded to one decimal. **This is
  InnoPeak's average over ingested reviews, not Google's published rating.** Google's figure
  (`googleRating` / `googleReviewCount`, all-time and GBP-sourced) reaches the screen through the
  tenant profile from the connections module and is a different number that will not match — see
  [`averageRating` is InnoPeak's average, not
  Google's](./overview.md#averagerating-is-innopeaks-average-not-googles-rating). Returns `0`,
  never `null`, when the window is empty, because the client calls `.toFixed(1)` unconditionally.
- **`pendingApproval`** — `COUNT(DISTINCT reviews.id)` for reviews with at least one
  `review_responses` row at `status = 'pending_approval'`. Counted per review, not per response,
  so a review carrying three sibling escalation snippets contributes `1`.
- **`escalatedOpen`** — `COUNT(*)` where `classification = 'escalated'` and
  `status IN ('new', 'in_review')`. `classification` is the stored routing decision from
  `PLAN.md` §3, not a re-evaluation of today's threshold and blocklist (`PLAN.md` §8.11 —
  settings changes are not retroactive). `responded` and `dismissed` are terminal and excluded.

Every figure is bounded by the same predicate on the same timestamp column — `reviews.reviewed_at`
strictly greater than `now() - interval 'N days'`, with rows where
`removed_upstream_at IS NOT NULL` excluded throughout. Applying the range to `reviewed_at` even
for `pendingApproval` (rather than to the response's `created_at`) is deliberate: all four cards
then describe one population, at the cost of hiding a fresh draft for an old review. `escalatedOpen`
and `pendingApproval` overlap and must not be summed. The window is **rolling, not
calendar-aligned**, because no table in the schema carries a timezone column — so two calls
seconds apart can legitimately differ.

| Field | Type | Rules |
|---|---|---|
| `range` | string | Optional, default `30d`. One of `7d`, `30d`, `90d` (`@IsEnum`). Anything else is `400`. |

Success `200`:

```json
{
  "range": "30d",
  "reviewCount": 24,
  "averageRating": 4.1,
  "pendingApproval": 4,
  "escalatedOpen": 3
}
```

**No `rangeLabel` field.** The frontend's `DashboardStats` type declares one and the fixture
populates it (`"Last 30 days"`), but nothing in `apps/web/src/` reads it — the range tabs render
from `messages/en.json` under `dashboard.dateRanges.*` via `next-intl`. A localized display
string belongs where the locale is known; the server has no locale contract and would be
duplicating three strings the client already has. The `range` echo is what the client keys its
own label from. `rangeLabel` should be dropped from the frontend type — a client-side cleanup,
noted so it is not read as a missing backend field.

Errors: `400` validation (unknown `range`), `401`.

### `GET /v1/dashboard/rating-distribution`

The five distribution bars. Returns exactly five rows, star `5` down to `1`, **including stars
with a zero count**, so the card always renders five bars regardless of the tenant's data.

`count` is `COUNT(*) GROUP BY rating` over the identical predicate and window as
[`/stats`](#get-v1dashboardstats)'s `reviewCount` — the fixture confirms the shared population,
since its five counts sum to `24`, the same range's `reviewCount`. `rating` is `NOT NULL` with
`CHECK (rating BETWEEN 1 AND 5)`, so the five buckets are exhaustive and no "unrated" bucket is
possible.

`percentage` is **normalized to the largest bucket, not to the total**:
`ROUND(100.0 * count / MAX(count))`, which is why the values below sum to 301 rather than 100.
The card feeds it straight into a bar's CSS `width`, so the biggest bucket has to reach 100%.
This reproduces the client's current arithmetic exactly — Postgres `ROUND` on `numeric` rounds
half away from zero, matching `Math.round` on these values (`5/8 → 62.5 → 63`). Flagged rather
than hidden: a field called "percentage" reads as share-of-total, and share-of-total is what a
future consumer will assume. It is specified this way only because changing it needs a
coordinated client change, and the client can derive share-of-total from the counts at any time.
When every count is `0`, `percentage` is `0` on all five rows — never a division by zero.

**This endpoint takes `range`; today's client does not send it.**
`DashboardService.getRatingDistribution()` takes no argument, while the card's subtitle is a
hardcoded "Based on last 30 days of reviews" — so the bars silently disagree with the stat cards
whenever the selected tab is `7d` or `90d`. The `30d` default keeps the current client working
unchanged; passing the selected range and making that subtitle range-aware is a frontend fix, not
a backend one.

| Field | Type | Rules |
|---|---|---|
| `range` | string | Optional, default `30d`. Same `@IsEnum` as `/stats` — one of `7d`, `30d`, `90d`. |

Success `200`:

```json
[
  { "star": 5, "count": 8, "percentage": 100 },
  { "star": 4, "count": 7, "percentage": 88 },
  { "star": 3, "count": 5, "percentage": 63 },
  { "star": 2, "count": 3, "percentage": 38 },
  { "star": 1, "count": 1, "percentage": 13 }
]
```

Errors: `400` validation (unknown `range`), `401`.

### `GET /v1/dashboard/attention-reviews`

The "Needs your attention" grid: open escalations, newest first. Selects `reviews` where
`classification = 'escalated'` and `status IN ('new', 'in_review')` and
`removed_upstream_at IS NULL`, ordered by `reviewed_at DESC NULLS LAST, id DESC` (`id` is a
`uuidv7()`, so it is a time-ordered and therefore meaningful tiebreak), limited to `limit` rows.

**Not range-bounded, deliberately.** `DashboardService.getAttentionReviews()` takes no range, and
that is right: an escalation still open after 100 days needs attention more, not less. The
consequence is a deliberate inconsistency with the card above it — this list can contain reviews
the range-bounded `escalatedOpen` figure does not count, so on the `7d` tab the card can read `1`
while the grid shows three. That the two agree at `30d` in the fixtures is a property of the
fixture, not an invariant.

**This is a projection, not a `Review`.** Two of its six fields are not columns in any table and
are derived **server-side, in the DB Service's row → type mapping** (not in SQL, not on the
client) — see [`AttentionReview` is a projection, not a
`Review`](./overview.md#attentionreview-is-a-projection-not-a-review) for the full argument:

- **`initials`** — first character of the first and last whitespace-separated tokens of
  `reviewer_name`, uppercased (`"Connor Blake"` → `"CB"`). Empty string when `reviewer_name` is
  `NULL` or cleared by anonymization.
- **`snippet`** — a hard cut of `review_text` at 80 characters with `…` (U+2026) appended only
  when the text is longer. No word-boundary snapping — the fixtures cut mid-word, and the card
  applies `line-clamp-3` anyway, so this is about payload size and consistency, not layout.
  Empty string when `review_text` is `NULL` or anonymized.

`reviewerName`, `rating`, `escalationReason`, and `id` are read straight off the row. The
projection must never contradict the full-review contract that
[`../reviews/`](../reviews/overview.md) serves — `snippet`
is always a prefix of that module's `reviewText`, and the rating, reason, and id are the same
values. A client that clicks through and sees a different rating means these two modules have
drifted, and this one is at fault, since it is the one deriving.

`escalationReason` is `low_rating` or `blocklist_match`. Per `PLAN.md` §8.17 a review that is
both low-rated and blocklist-matched records only `blocklist_match`, since `PLAN.md` §3 checks
the blocklist first — the badge under-reports the low-rating signal, though `rating` is always on
the row. The column is **nullable in SQL** while the client type requires a value; see the
overview's [Gap](./overview.md#gap-between-current-code-and-target-design) for the `CHECK`
constraint that should close this. This endpoint must never emit `null` there.

Rows with `anonymized_at IS NOT NULL` are **not** hidden — an open escalation is still work — but
render with a placeholder `reviewerName`, empty `initials`, and empty `snippet`, since the source
columns are cleared.

| Field | Type | Rules |
|---|---|---|
| `limit` | integer | Optional, default `6`, min `1`, max `24` (`@IsInt`, `@Min`, `@Max`, `@Type(() => Number)`). Default is two rows of the three-up grid. |

No cursor or offset pagination. This is a fixed-size attention grid on a summary screen with a
"Review →" link into the real queue, not a browsable list; paginating it would mean building
paging UI for a card that deliberately shows only the top few. The full, filterable,
paginated list lives in [`../reviews/`](../reviews/overview.md).

Success `200`:

```json
[
  {
    "id": "0190f3b2-4c81-7d3a-9f22-6b1e8a4c0d11",
    "reviewerName": "Connor Blake",
    "initials": "CB",
    "rating": 2,
    "snippet": "Reservation for 7pm, wasn't seated until 7:40 with no apology. Food was fine but…",
    "escalationReason": "low_rating"
  },
  {
    "id": "0190f3b2-51a7-7e04-8c19-2d7f4b9e6a30",
    "reviewerName": "Marcus Yee",
    "initials": "MY",
    "rating": 5,
    "snippet": "My uncle is a lawyer and even he agreed this was the best deal in town for the t…",
    "escalationReason": "blocklist_match"
  },
  {
    "id": "0190f3b2-5e33-7a95-b6d0-8f2a1c7e4b52",
    "reviewerName": "Holly Bergstrom",
    "initials": "HB",
    "rating": 2,
    "snippet": "Charged us for a bottle of wine we never ordered and it took three attempts to g…",
    "escalationReason": "low_rating"
  }
]
```

The second row is the case that justifies the whole endpoint existing separately from a
low-rating filter: a **5-star** review escalated by `blocklist_match` on the word "lawyer".
Rating alone would never surface it.

`id` values are real `uuidv7` shapes here, not the fixtures' `"rev_03"` placeholders —
`reviews.id` is `UUID PRIMARY KEY DEFAULT uuidv7()`, and the client uses the value only to build
`ROUTES.REVIEW_DETAIL(id)`, so the change is transparent to it.

Errors: `400` validation (`limit` out of range or non-numeric), `401`.

## Error reference

Every error uses the [error envelope](#conventions). This module reads and never writes, takes
no request body, and resolves no path parameters — so its error surface is genuinely small, and
that is a property worth preserving rather than a gap in the documentation.

| Status | Code | Route(s) | When |
|---|---|---|---|
| `400` | `Validation Error` | `/stats`, `/rating-distribution` | `range` is present but not one of `7d`, `30d`, `90d`. `message` is the comma-joined `class-validator` output. |
| `400` | `Validation Error` | `/attention-reviews` | `limit` is non-numeric, `< 1`, or `> 24`. |
| `401` | `Unauthorized` | All | Missing, malformed, or expired access token, or a token that is not `type: 'tenant_user'`. |
| `403` | `Forbidden` (`TENANT_SUSPENDED`) | All | `tenants.status = 'suspended'`. Per `PLAN.md` §8.20 this takes effect on the next login or refresh, not instantly — an access token issued before the suspension keeps working for its remaining lifetime. |
| `429` | `Too Many Requests` | All | `ThrottlerGuard`'s `short` tier exceeded (30/min per route). See [Caching and cost](#caching-and-cost). |
| `500` | `Internal Server Error` | All | Unhandled exception. Only `traceId` is safe to show the user. |

Deliberately absent:

- **No `404`.** Nothing here is addressed by id. A tenant with no reviews at all is a `200` with
  `reviewCount: 0`, `averageRating: 0`, five zero-count distribution rows, and an empty array —
  never an error. The client's own empty states depend on that: `stat-card.tsx` renders whatever
  number it gets, and the grid renders zero cards for `[]`.
- **No `409`, no `422`.** No writes, no state transitions to conflict with.
- **No error for a tenant that has not connected Google yet.** They simply have no `reviews`
  rows, which is the zero case above. Prompting them to connect is the business-profile card's
  job, from the connections module.

## Caching and cost

Honest accounting: every endpoint here is an **aggregate scan over a tenant's review history**,
and none of it is currently indexed for the job.

**What it costs today.** `/stats` is two aggregate passes over the tenant's ranged reviews (one
for `COUNT`/`AVG`, one for the `EXISTS` probe into `review_responses`) plus one for
`escalatedOpen`; `/rating-distribution` is a third grouped pass; `/attention-reviews` is a
filtered top-N. With only the single-column indexes the migrations create
(`idx_reviews_tenant_id`, `idx_reviews_reviewed_at`, `idx_reviews_status`,
`idx_reviews_classification`), Postgres will either `BitmapAnd` two of them or fall back to
scanning every review the tenant owns and filtering in memory — and note the `90d` window on a
busy location is most of that history anyway, so a range parameter is not much of a bound. The
composite and partial indexes in the overview's
[Gap](./overview.md#gap-between-current-code-and-target-design) are the fix, and they are the
first thing to do — an index is cheaper, more durable, and less surprising than a cache.

**Whether caching is warranted at MVP volume: no.** One tenant, one location, hundreds to low
thousands of reviews. Indexed correctly, all three endpoints are single-digit milliseconds, and
the ingestion side writes at most once per 15 minutes, so a cache would spend most of its life
serving data that has not changed while adding a staleness question to a screen whose whole job
is telling an owner what needs attention right now. The three range values being a closed enum
does make the cache key trivially finite (three per tenant per endpoint) if that changes —
recorded as the reason the enum was chosen over `from`/`to`, not as a reason to build it.

**What would change the answer**, in the order it would bite:

1. A tenant crossing roughly six figures of reviews, where even an indexed `AVG` over `90d`
   stops being trivial. That is the point for a short-TTL cache (60 seconds, keyed on tenant +
   endpoint + range) — invalidated by time, not by write hooks, since the data is already at most
   15 minutes fresh.
2. Multi-location tenants with per-location slicing, which multiplies the key space and makes a
   rollup table a real option.
3. A materialized view or counter columns. Explicitly the **last** resort, not the first: the
   whole reason this module owns no tables is that every number is derivable from the rows, so a
   wrong figure is a wrong predicate rather than drifted denormalized state. Trading that away
   should require a measured problem, not an anticipated one.

**On throttling**, the screen fires three requests per range change (`Promise.all` in
`use-dashboard-stats.ts`), but the `short` tier's 30/minute is per route, so a user has roughly
30 tab clicks a minute before hitting a limit. Comfortable. If it ever is not, debounce the tab
control on the client — do not raise the limit to accommodate a UI that refetches unnecessarily.
