---
sidebar_position: 1
---

# Admin Overview Module

## Overview

The admin-overview module serves the Super Admin area's landing screen — the four stat cards, the
"Recent Businesses" and "Needs attention" panels, the signup-trend chart, and the platform-activity
feed on `apps/web/src/app/admin/_components/admin-overview-view.tsx`. It is almost entirely
**read-only, and owns no table its own figures come from**: every number is either a `COUNT`
over `tenants`/`users`/`reviews`/`review_responses`, or a read of `platform_activity_log`
(`0009_admin_overview.sql`), a small purpose-built log this module reads but does not write.

**Implemented.** `src/api/admin/controllers/admin-overview.controller.ts`,
`src/api/admin/services/admin-overview.service.ts`,
`src/api/admin/swagger/admin-overview.swagger.ts`, and the `dto/` classes it composes
(`AdminOverviewStatsResponseDto`, `AdminBusinessResponseDto`, `AdminSignupTrendPointResponseDto`,
`PlatformActivityResponseDto`) all exist and are exercised by the frontend, alongside
`AdminOverviewDbService` + `AdminOverviewRepository` under
`src/db/repositories/admin-overview/`. Every route is gated by
`@Roles(JwtTokenType.PLATFORM_ADMIN)` at the controller level and re-checked in the service via
`requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY)` — there is no tenant-scoped path through
this module at all, unlike [Dashboard](../dashboard/overview.md), which is the tenant-user
equivalent of a landing-screen aggregation module.

For the endpoint-by-endpoint contract, see [Admin Overview Module — API
Reference](./api-reference.md).

## Data model

No tables are created for this module's own sake. `platform_activity_log` is owned in the sense
that `AdminOverviewRepository` is the only reader of it, but it is written by three *other*
modules' services (`AdminBusinessesService` on suspend/reactivate, `AdminSettingsService` on
invite send/revoke and admin enable/disable, `AdminUsersService` on user activate/deactivate) —
this module's own `AdminOverviewDbService.recordActivityBestEffort` is the shared write path they
all call through, but none of those actions originate here.

| Figure | Source | Notes |
|---|---|---|
| `stats.businessCount` | `AdminBusinessesDbService.count()` — `COUNT(*)` over `tenants` | Every tenant on the platform, `pending_activation` and `suspended` included |
| `stats.userCount` | `AdminUsersDbService.count()` — `COUNT(*)` over `users WHERE anonymized_at IS NULL` | Excludes anonymized (staff-erased) rows, across every tenant |
| `stats.totalReviewsFetched` | `AdminOverviewRepository.getReviewStats()` — `COUNT(*)` over `reviews` | Platform-wide, no `tenant_id` filter |
| `stats.totalRepliesSent` | Same method — `COUNT(*)` over `review_responses WHERE status = 'posted'` | Only replies that actually reached Google — `approved` and `post_failed` don't count here, unlike the [prompt-performance endpoint](../prompts/api-reference.md#get-v1promptspromptidstats)'s broader `approvedCount`, because this figure answers "how much did the product actually do," not "how much did a human approve" |
| Recent businesses / needs attention | `AdminBusinessesDbService.findRecent()` / `findNeedingAttention()` over `tenants`, with owner name/email, user count, and latest connection status resolved via correlated subqueries | Same rows and columns the Businesses management screen uses (`AdminBusinessesRepository`'s `ADMIN_BUSINESS_COLUMNS`) — this module only asks for a smaller, differently-filtered page of them |
| Signup trend | `AdminOverviewRepository.getSignupTrend()` — `tenants` grouped by `EXTRACT(YEAR/MONTH FROM created_at)`, UTC | Zero-filled to a full window by `fillSignupTrendWindow` before the response leaves the service — see [below](#signup-trend-is-zero-filled-in-the-service-not-the-repository) |
| Recent activity (glance feed) | `AdminOverviewRepository.getRecentActivity()` over `platform_activity_log`, merged server-side with synthesized `business_joined` entries — see [below](#recent-activity-is-merged-server-side-with-synthesized-business_joined-entries) | No filter; every entry type (real and synthesized) surfaces in one feed, capped at `limit` after merging |
| Activity log (paginated) | `AdminOverviewRepository.listActivity()` — real `platform_activity_log` rows only, paginated and filterable by `type` | Distinct endpoint, distinct from the glance feed above — see [API surface](#api-surface) |

## Why this is its own module, not folded into admin-businesses/admin-users

The same split [Dashboard](../dashboard/overview.md#overview) draws between a write surface over a
domain entity and a screen-shaped read: `AdminBusinessesService`/`AdminUsersService`/
`AdminSettingsService` own their entities and every mutation against them (suspend a tenant,
deactivate a user, send an invite), while this module never writes a `tenants` or `users` row and
exists purely to compose already-owned reads into the shapes one screen's five panels need.
`AdminOverviewDbService` leans on that split directly — it injects
`AdminBusinessesDbService`/`AdminUsersDbService` as siblings and reuses their row-to-summary
mapping (`toSummary`/`toConnectionStatus`) rather than re-deriving `BusinessStatus`/
`BusinessConnectionStatus` a second time, so the two screens can never drift into disagreeing about
what "connected" or "suspended" means for the same tenant.

## Needs attention: priority order is deliberate, not just "not connected"

`findNeedingAttention` ranks a non-connected tenant by *why* it isn't connected, not merely by
recency: a tenant whose connection was `latestConnectionDisconnectedAt`-set outranks one that is
`needs_reauth`, which outranks one that has `never_connected` at all
(`AdminBusinessesRepository.findNeedingAttention`'s `priorityExpr`, `CASE` values `0`/`1`/`2`
respectively; a `connected` tenant maps to `NULL` and is excluded by the `WHERE` entirely). Ties
within a priority bucket fall back to newest-first.

This ordering exists because the naive one — newest signups first, filtered to "not connected" —
was useless in practice. `BusinessConnectionStatus`'s own doc comment
(`apps/backend/src/common/enums/business-connection-status.enum.ts`) states the failure mode
directly: the newest tenants in any list are almost always ones that signed up and never finished
onboarding (`never_connected`), so a genuine mid-life disconnection on a paying, already-onboarded
customer — the actually urgent case — never surfaced in a panel capped at 3 rows. Splitting
`disconnected` (had a working connection, lost it) from `never_connected` (never finished
onboarding) and ranking the former first is what makes the panel answer "who needs a human to look
at this today" instead of "who signed up most recently."

## Signup trend is zero-filled in the service, not the repository

`AdminOverviewRepository.getSignupTrend` only returns months that actually had at least one
signup — a `GROUP BY` over `tenants.created_at` produces no row at all for a month with zero. The
service (`AdminOverviewService.getSignupTrend`) calls `fillSignupTrendWindow` before responding,
which walks every month in the trailing window back from the current UTC month and fills in `count:
0` for any the repository didn't return.

This mirrors the dashboard module's [zero-filled rating
distribution](../dashboard/overview.md#rating-distribution-is-zero-filled-and-keyed-by-rating-not-an-array)
for the same reason: `SignupTrendCard` renders one bar per month at equal width, so an omitted
zero-signup month would draw two non-adjacent calendar months as visually adjacent bars, implying
an unbroken series and silently hiding a real gap. Filling the window server-side, once, keeps the
response itself the source of truth for "no signups that month" rather than leaning on the
frontend to know the window's start and end and reconstruct it — `SignupTrendCard`
(`apps/web/src/app/admin/_components/signup-trend-card.tsx`) does no gap-filling of its own, only
month-key parsing and bar-height math.

The window is UTC, matching the app's runtime timezone, for the identical reason `reviewedAt`
windows are UTC in the dashboard module: a tenant created at `2026-02-01T00:30:00Z` has to land in
February for every admin regardless of which timezone they're viewing from.

## Activity log: a purpose-built write, not a generic audit trail

`platform_activity_log` covers exactly eight event types
(`business_suspended`/`reactivated`, `admin_invite_sent`/`revoked`, `admin_disabled`/`enabled`,
`user_activated`/`deactivated`) and nothing else — it is written explicitly, once, by the same
service call that performs the action, with the real actor already in hand
(`0009_admin_overview.sql`'s own header comment). This is a deliberate contrast with the generic,
trigger-populated `audit_logs` table the backend's boilerplate originally shipped: that table had
no reader anywhere in the product and was removed entirely (`apps/backend/CLAUDE.md`'s `0000_foundation`
migration note). A narrow, explicitly-written log that only this module reads is what actually gets
rendered, instead of a wide one nothing consults.

Writing an entry is best-effort and **never fails the action it logs.** `recordActivityBestEffort`
catches and logs any insert failure rather than propagating it, because every caller records
activity *after* its primary write has already committed (suspending a tenant, deleting an invite)
— those two writes are not in one transaction, so letting a logging failure surface as a `500`
would tell an admin their action didn't apply when it actually did. A dropped log entry is a worse
outcome to hide than to accept: it is logged at error level so it stays visible, but it does not
retry and does not roll back the action it was recording.

## Recent activity is merged server-side, with synthesized `business_joined` entries

A tenant signing up has no platform-admin actor at all — `POST /v1/auth/signup` is the tenant's own
action, which is exactly why it was never one of `platform_activity_log`'s eight real types (that
log is scoped to actions a platform admin takes *on* someone else). The Overview page's glance feed
still needs to show "New business X signed up" alongside real admin actions, so
`AdminOverviewService.getRecentActivity` synthesizes one `business_joined` entry per recent tenant
from `AdminBusinessSummary.createdAt` — a column that already exists, needing no new table — and
merges it with the real log rows before responding:

```ts
async getRecentActivity(actor: AuthUser, limit: number): Promise<PlatformActivityResponseDto[]> {
  requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
  const [rows, businesses] = await Promise.all([
    this.adminOverviewDbService.getRecentActivity(limit),
    this.adminOverviewDbService.getRecentBusinesses(limit),
  ]);
  const activities = rows.map(row => PlatformActivityResponseDto.from(row));
  return buildActivityFeed(activities, businesses, limit);
}
```

**This used to be two client-side calls, merged in the browser.** The frontend previously called
both `GET /activity` and `GET /recent-businesses` independently and stitched the two together
itself (`buildActivityFeed` in `apps/web/src/app/_libs/utils/admin-activity-feed.ts`). Moving the
merge into `AdminOverviewService.getRecentActivity` (backend `buildActivityFeed`,
`src/api/admin/utils/activity-feed.utils.ts`) means the Overview page's activity panel is now fed
by exactly one network call — see [Consumers](#consumers) below for the frontend side of that
change.

**Fetching `limit` rows from *each* source before merging is always sufficient, not a heuristic.**
The true top-`limit` of a union of two independently-sorted lists can never need more than `limit`
items from either list alone: if the merged top-`limit` needed more than `limit` items from one
source, that source alone would already exceed `limit`, a contradiction. So
`Promise.all([getRecentActivity(limit), getRecentBusinesses(limit)])` — fetching `limit` from each,
independently, before a single `sort` + `slice(0, limit)` — is provably correct, never
under-fetching (which could drop a real entry that should have made the cut) and never
over-fetching unboundedly. `ADMIN_ACTIVITY_LIMIT_DEFAULT` was bumped from `5` to `8` when this
shipped, to preserve the previous merged-feed's effective size now that one endpoint *is* the
merged feed rather than a single un-merged source.

**The paginated activity-log endpoint below is deliberately real-log-only — no `business_joined`.**
There is no precedent anywhere in this codebase for paginating a `UNION` of two independently
paginated sources (verified by checking both existing paginated endpoints —
[`listSyncRuns`](../connections/api-reference.md) and [admin-billing's own
`listWebhookEvents`](../admin-billing/api-reference.md#webhook-activity) — both single-table), and
building one for this one glance-card merge was judged not worth the complexity. The bounded,
un-paginated `GET /activity` above is the only place `business_joined` ever appears.

## API surface

Six `GET` routes, each mapped straight to one response DTO — see the [API
reference](./api-reference.md) for full request/response contracts:

| Route | Query params | Response |
|---|---|---|
| `GET /v1/admin/overview/stats` | — | `AdminOverviewStatsResponseDto` |
| `GET /v1/admin/overview/recent-businesses` | `limit` (1–50, default 5) | `AdminBusinessResponseDto[]` |
| `GET /v1/admin/overview/needs-attention` | `limit` (1–50, default 3) | `AdminBusinessResponseDto[]` |
| `GET /v1/admin/overview/signup-trend` | `months` (1–24, default 6) | `AdminSignupTrendPointResponseDto[]` |
| `GET /v1/admin/overview/activity` | `limit` (1–50, default 8) | `PlatformActivityResponseDto[]` — merged with synthesized `business_joined` entries, see [above](#recent-activity-is-merged-server-side-with-synthesized-business_joined-entries) |
| `GET /v1/admin/overview/activity-log` | `page`, `pageSize` (1–100, default 20), `type` | `PlatformActivityListResponseDto` — real log rows only, no `business_joined` |

All six narrow to a platform admin in the service layer via
`requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY)`, on top of the controller-level
`@Roles(JwtTokenType.PLATFORM_ADMIN)` — belt and braces the same way the prompts and dashboard
modules narrow to a tenant user in their own service layers. No route carries a `@Throttle()`
override, so all six fall back to the global `short` tier (30/minute).

## Consumers

`useAdminOverview` (`apps/web/src/hooks/admin/use-admin-overview.ts`) is the single hook every
panel on the Overview page goes through — it fires five queries independently (one per route, via
`useQuery`, not a single combined call — `activity-log` is not one of the five, since it backs a
different page, see below) and exposes one combined `isLoading`/`isError`. The combined `isError`
is deliberate: `AdminOverviewView` blanks the *entire* page on any one query failing, rather than
letting four panels render confident zeroes ("0 Businesses", "Nothing needs attention", "No signups
yet") beside a fifth that visibly failed — an outage described as good news being worse than an
explicit retry state.

Each query feeds exactly one card: `RecentBusinessesCard` and `NeedsAttentionPanel` (which renders
`null` entirely when its list is empty, letting `RecentBusinessesCard` take the full row rather
than leaving a blank column), `SignupTrendCard`, and `ActivityLogCard`. `ActivityLogCard`'s feed is
now exactly `GET /activity`'s own response — no client-side merge — since the merge described
[above](#recent-activity-is-merged-server-side-with-synthesized-business_joined-entries) moved into
the backend; the frontend's own `buildActivityFeed` util that used to do this client-side merge was
deleted once nothing called it, and `recentBusinesses`' own fetch limit dropped from `8` back to
`3` to match what `RecentBusinessesCard` actually displays, now that it no longer also has to supply
merge candidates for the activity feed. `AdminOverviewView` also renders a "Show more →" link from
`ActivityLogCard` into a separate, dedicated Activity page (`/admin/activity`) with **Platform
activity** and **Webhook activity** tabs — `PlatformActivityLogCard`
(`apps/web/src/app/admin/activity/_components/`) is the paginated/filterable consumer of `GET
/activity-log` above, distinct from `ActivityLogCard`'s bounded glance version. See [Admin Console:
search, pagination, and the loading-state trap](../../frontend/admin-console.md) for the shared
pagination/filter pattern both that card and [Admin Billing's webhook activity
card](../admin-billing/overview.md#consumers) use.

## Known limitations

- **Platform-wide aggregates still scan, but are cached.** `getReviewStats` counts `reviews` and `review_responses` with
  no `tenant_id` filter, so no index can narrow them. `idx_tenants_created_at` now serves the signup trend's
  `GROUP BY` on `tenants.created_at`. The Overview stats and signup trend, and the Statistics summary, are served from a
  60-second in-process cache (`TtlCache`, `ADMIN_AGGREGATE_CACHE_TTL_MS`): per instance, so a number is at most a minute
  old on any of them, concurrent misses share one load, and a failed load is never cached. Recent businesses,
  needs-attention and the activity feed are not cached: they are what an admin checks right after acting.
- **`recordActivityBestEffort` is retried and counted, not guaranteed.** A transient failure is retried (3 attempts); a
  value too long for its `VARCHAR(255)` column is trimmed first, and an integrity or data error is not retried (it would
  fail the same way). An entry that still cannot be written increments `platform_activity_dropped_total{type}` (exported
  at 0 from startup, so a rate alert works) and is logged at error level with its full JSON payload for replay by hand.
  It is still not in the same transaction as the action it records, so the feed is not a complete record for anything
  compliance-adjacent.
