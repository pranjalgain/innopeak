---
sidebar_position: 1
---

# Admin Management Module

## Overview

Admin management is the Super Admin console's two cross-tenant CRUD surfaces: the **Businesses**
screen (every tenant, suspend/reactivate, plus platform-admin-only GDPR erasure request/cancel) and
the **Users** screen (every user across every tenant, activate/deactivate). Two separate
controllers, two separate route prefixes
(`/v1/admin/businesses`, `/v1/admin/users`), documented together because they share the same
platform-admin auth gate, the same activity-log write-through, and — as of this write-up — the
same server-side search architecture.

**Implemented.** `src/api/admin/controllers/admin-businesses.controller.ts` +
`admin-users.controller.ts`, `src/api/admin/services/admin-businesses.service.ts` +
`admin-users.service.ts`, `src/api/admin/swagger/admin-businesses.swagger.ts` +
`admin-users.swagger.ts`, and the `dto/` classes they compose
(`AdminBusinessResponseDto`, `AdminUserResponseDto`, `ListAdminBusinessesQueryDto`,
`ListAdminUsersQueryDto`), alongside `AdminBusinessesDbService` + `AdminBusinessesRepository` and
`AdminUsersDbService` + `AdminUsersRepository` under `src/db/repositories/`.

**Not to be confused with the `platform-admin` doc set** ([Platform Admin
Module](../platform-admin/overview.md)): that module is a pre-implementation target design for a
different, unbuilt concept — a separate `platform_admin_support_grants` act-as-token system for
cross-tenant support access. Nothing in that document corresponds to the code described here; this
page documents the `AdminBusinessesController`/`AdminUsersController` code that actually ships and
actually backs the console's Businesses/Users screens today.

For the endpoint-by-endpoint contract, see [Admin Management Module — API
Reference](./api-reference.md).

## Data model

No tables of its own. Both controllers read/write tables other modules own:

| Table | Read/write here | Notes |
|---|---|---|
| `tenants` | Read (list), write (`status` on suspend/reactivate, `status` + `erasure_requested_at` on erasure request/cancel) | `AdminBusinessResponseDto.status` collapses the real 4-value `tenant_status` (`pending_activation`/`active`/`suspended`/`erased`) down to `BusinessStatus`'s `active`/`suspended`/`erased` — only `pending_activation` gets folded away, into `active` — see [Admin Overview's own note](../admin-overview/api-reference.md#get-v1adminoverviewrecent-businesses) on the same collapsing rule. During the grace period the tenant still reads as plain `suspended`, not a distinct in-between value; `erased` only appears once the nightly cron has actually finished anonymizing the tenant — see [Tenant erasure](#tenant-erasure-request-and-cancel-platform-admin-only-not-tenant-self-service) below |
| `users` | Read (owner name/email correlated subqueries, list), write (`status` on toggle-active) | `AdminUsersRepository.findAll` is the one place in the backend that queries `users` across every tenant with no `tenant_id` filter — the Super Admin area's whole purpose |
| `review_provider_connections` | Read (latest-connection pair, correlated subquery) | Feeds `connectionStatus` on the Businesses list — same columns and same `toConnectionStatus` mapping as [Admin Overview](../admin-overview/overview.md#why-this-is-its-own-module-not-folded-into-admin-businessesadmin-users) reuses for its own Recent Businesses / Needs Attention panels |
| `refresh_tokens` | Read (`MAX(created_at)` correlated subquery) | Approximates `lastLoginAt` on the Users list — there is no dedicated `last_login_at` column on `users` |
| `platform_activity_log` | Write, via `AdminOverviewDbService.recordActivityBestEffort` | Every suspend/reactivate/toggle/erasure-request/erasure-cancel writes an entry (`BUSINESS_ERASED` is the one exception — see [Tenant erasure](#tenant-erasure-request-and-cancel-platform-admin-only-not-tenant-self-service)) — read back by [Admin Overview](../admin-overview/overview.md#activity-log-a-purpose-built-write-not-a-generic-audit-trail)'s Activity feed, never by this module |

## Server-side search: why, and why the two lists needed different SQL

Both list endpoints originally returned every row, unbounded (`findAll()` with no `.limit()`/
`.offset()` at all), and the frontend loaded the whole array once and filtered it client-side via a
shared `useSearchFilter` hook. That was fine at the data volumes this product runs at today, but it
shipped every tenant/user to the browser to filter most of them back out, and it meant the
`search` box's own doc comment for both repositories literally said "no pagination/filter params
yet." Both `findAll` methods now accept an optional `search: string` and apply it in SQL via
`ILIKE`, narrowing to the same fields the client-side filter used to match on:

- **Businesses**: tenant name OR the tenant's founding owner's name. The owner check can't be a
  second `ilike` column, because `ownerName` isn't a real column on `tenants` — it's a correlated
  scalar subquery in `ADMIN_BUSINESS_COLUMNS` (see that file's own extended comment on why a
  correlated subquery is used instead of a join, and why the `WHERE ... = tenants.id` correlation
  is written as the literal `tenants.id`, not `${schema.tenants.id}`, to avoid resolving to the
  wrong table's `id`). `businessSearchCondition` (`admin-businesses.repository.ts`) is an `EXISTS`
  subquery over `users` for exactly this reason.
- **Users**: user name OR business name. Both are already real, joined columns on this query (the
  list already `INNER JOIN`s `tenants` for `businessName`), so a plain
  `or(ilike(users.name, pattern), ilike(tenants.name, pattern))` is enough — no `EXISTS` needed.

Both use a shared `escapeLikePattern` helper (`src/common/helpers/like-pattern.utils.ts`, promoted
out of the reviews module's own search implementation so all three search sites share one
implementation) to escape literal `%`/`_`/`\` in the caller's search term before it's interpolated
into an `ILIKE` pattern — without it, searching for a business literally named "50% Off Dave's"
would match an unrelated, much broader set of rows than the literal substring typed.

**Pagination itself did not move server-side alongside search.** Both endpoints still return every
matching row, unbounded; the frontend still pages the (now server-filtered) result client-side via
the existing `usePagination` hook. This was a deliberate scope decision: the ask was specifically
"make search server-side," not a general pagination rework, and adding one without the other keeps
the response shape a bare array rather than introducing a `{ data, meta }` envelope for no reason
tied to this change. See [Known limitations](#known-limitations) for when that stops being enough.

## Tenant erasure: request and cancel (platform-admin only, not tenant self-service)

Two more routes on `AdminBusinessesController` — `POST
/v1/admin/businesses/:tenantId/request-erasure` and `POST
/v1/admin/businesses/:tenantId/cancel-erasure` — give a Super Admin a GDPR-style "right to
erasure" action against *someone else's* tenant. This is deliberately **not** exposed as tenant
self-service: a tenant owner cannot erase their own business from the settings area. That's a
different, narrower, self-service flow that already exists one level down — the tenant-owner-facing
"request member removal" flow (documented in the settings module) lets an owner remove one of their
own teammates, not the tenant itself. Full-tenant erasure is intentionally a platform-admin-only,
console-driven decision.

Erasure is a two-phase, grace-period design rather than an immediate hard delete, because the
anonymization it eventually triggers is irreversible. `requestErasure`
(`AdminBusinessesService.requestErasure` → `AdminBusinessesRepository.requestErasure`) sets
`tenants.status = 'suspended'` and stamps `erasure_requested_at = now()` in the same update — every
user in the tenant loses access immediately, exactly as a plain suspend would — but nothing is
anonymized yet. The actual anonymization happens later, in the nightly erasure-purge cron job, once
the configured grace period has elapsed, and is cancellable any time before then via `cancelErasure`.

**Why reuse `status = 'suspended'` instead of adding a fourth `tenant_status` value:** every
existing suspend-check elsewhere in the app — auth guards, connection checks, anything that already
treats `suspended` as "no access" — keeps working unmodified for a tenant that's mid-grace-period,
with zero call sites to update. Only the nightly cron job eventually moves the tenant on to the
terminal `erased` status once anonymization actually completes; this module never writes `erased`
itself.

**Grace period.** Read via a shared helper, `getErasureGracePeriodDays(configService)`
(`src/common/constants/erasure.constants.ts`, default 21 days, env var
`ERASURE_GRACE_PERIOD_DAYS`). The same helper backs the nightly cron's own purge query and the
tenant-owner-facing member-removal flow's grace period, so all three "N days" can't drift apart from
each other by editing only one call site. `requestErasure`'s response message embeds this value
(e.g. "...permanently erased in 21 days unless you cancel first") so the console can surface a
concrete "takes effect on" date without hardcoding the number itself.

**`cancelErasure`** is a clean, full undo — safe precisely because nothing is anonymized until the
grace period actually elapses. It runs inside a transaction and takes a per-tenant Postgres advisory
lock, `pg_advisory_xact_lock(hashtext('gdpr:tenant-erasure'), hashtext(tenantId))`, before touching
the row. This is the **same lock key** — the same `'gdpr:tenant-erasure'` string, hashed together
with the same tenant id — that the nightly erasure-purge cron job also takes (as a session-level
lock) before it starts anonymizing that tenant's users. Sharing the key is what prevents an admin's
cancel from racing the cron mid-anonymization for the same tenant: without it, `cancelErasure` could
"succeed" in the database while the cron, already partway through its per-user loop for that tenant,
keeps anonymizing users regardless of the cancel. Whichever side loses the race for the lock simply
re-reads the tenant's true current state afterward instead of racing past it. (The cron's own
mechanics are documented separately, as "the erasure-purge cron job" — this module only needs the
coordination contract, not its internals.)

The repository's `cancelErasure` WHERE clause also excludes tenants that are already fully `erased`.
`erasure_requested_at` intentionally survives as a historical record even after erasure completes —
so an admin can still see when erasure was originally requested for a tenant that's since been fully
anonymized — which means "has `erasure_requested_at` set" alone is not the same as "cancellable."
Without the extra `status != 'erased'` guard, calling cancel on an already-erased tenant would
silently un-erase it: flipping `status` back to `active` and reactivating a tenant every one of
whose users has already been anonymized.

**Conflict with plain suspend/reactivate.** `setStatus` — the existing plain suspend/reactivate
route — now refuses to run at all while a tenant has a pending erasure request
(`erasure_requested_at` set), throwing `BusinessErasurePendingException` (409) instead of writing
`tenants.status`. This exists because plain suspend/reactivate and the erasure request/cancel flow
must never both be allowed to touch `tenants.status` for the same tenant: if `setStatus` were
allowed to reactivate a tenant with a pending erasure request, it would leave `erasure_requested_at`
stale on a now-`active` tenant, and a later, entirely unrelated suspend through that same plain route
would then look to the nightly cron exactly like "grace period long elapsed, due for purge" — even
though no new grace period was ever granted for *that* suspension. The caller has to go through
`cancelErasure` first to clear the stale timestamp before `setStatus` will run again.

**Activity log.** Three related types on `platform_activity_log`:
`BUSINESS_ERASURE_REQUESTED` and `BUSINESS_ERASURE_CANCELLED` are written here, by this module, at
the same "log after the write, only on success" point as the existing
`BUSINESS_SUSPENDED`/`BUSINESS_REACTIVATED` entries. `BUSINESS_ERASED` is *not* written by this
module at all — it's logged later, by the cron job itself, once anonymization actually completes —
so the Activity feed's picture of one tenant's erasure lifecycle is assembled from two different
code paths writing to the same log, one request-time and one grace-period-later.

## Admin user toggle-active vs. a pending team-member removal

A smaller, related guard on the Users side: `AdminUsersService.toggleActive` now refuses to run
(`UserRemovalPendingException`, 409) when the target user has a pending team-member-removal request
in progress. That request is set via a separate, tenant-owner-facing "request member removal" flow
(documented in the settings module) — a *self-service* action a tenant owner takes against their own
teammate, distinct from anything on this platform-admin console.

The guard exists for the same structural reason as `BusinessErasurePendingException` above, one
level down: a slower, separate lifecycle (the pending removal's own grace period) is already in
flight for this row, and the fast plain-toggle route must not be allowed to run alongside it and
clobber its state. Concretely, reactivating a "disabled" user out from under a pending removal would
leave the user looking active again with no visible sign that the nightly erasure-purge job still
has them queued for anonymization once the *original* removal's grace period elapses. The caller
must cancel the pending removal first (via the settings module's own flow), the same way a pending
tenant erasure must be cancelled before `setStatus` will touch that tenant again.

## Consumers

`useAdminBusinesses` / `useAdminUsers` (`apps/web/src/hooks/admin/`) debounce the search box
(300ms, matching `useReviewQueue`'s own constant) before it reaches the API, and use
`placeholderData: keepPreviousData` so the previous result set stays on screen while the next
search's fetch is in flight — no full-page skeleton flash on every keystroke. See [Admin Console:
search, pagination, and the loading-state trap](../../frontend/admin-console.md) for the shared
pattern (and the bug this session found and fixed: mapping the hook's `isLoading` to the query's
`isFetching` made the *entire* view — search bar and result count included, not just the rows —
swap to a loading skeleton on every debounced keystroke).

Both hooks' mutations (`suspendBusiness`/`reactivateBusiness`, `toggleActive`) invalidate the whole
query-key prefix (`adminBusinessesQueryKey`/`adminUsersQueryKey`) rather than patching one cached
page with `setQueryData` — once `search` became part of the query key, a single cache patch could
no longer reach every cached search-keyed variant a mutated row might appear under, so a broader
invalidation replaced it.

## Known limitations

- **List endpoints are still unbounded.** A search with no matches narrows the response to zero
  rows, but an unfiltered `GET /businesses` or `GET /users` still returns every row on the
  platform. Fine at current tenant/user counts (see [Admin Overview's own note on the same
  tradeoff](../admin-overview/overview.md#known-limitations)); the fix when it stops being fine is
  adding real `page`/`pageSize` to `ListAdminBusinessesQueryDto`/`ListAdminUsersQueryDto`, following
  the `PaginationMetaDto` pattern [Admin Billing's webhook-events
  endpoint](../admin-billing/api-reference.md#webhook-activity) and [Admin Overview's
  activity-log endpoint](../admin-overview/api-reference.md#activity-log) already established —
  in the Businesses case, the accompanying `count()` query would need to reuse the exact same
  `businessSearchCondition` `WHERE`, not re-derive it, or the row total and the page contents could
  silently disagree.
- **No index backs the `ILIKE` search.** A leading-wildcard `%term%` pattern can't use a plain
  B-tree index regardless; a `pg_trgm` GIN index on `tenants.name`/`users.name` is the fix if
  search latency becomes noticeable at higher row counts.
