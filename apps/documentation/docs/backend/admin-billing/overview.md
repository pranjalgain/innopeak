---
sidebar_position: 1
---

# Admin Billing Module

## Overview

The admin-billing module is the Super Admin area's read-only window into the tenant-facing
[Billing module](../billing/overview.md)'s data — platform-wide plan mix, subscription health, and
Stripe webhook activity, across every tenant at once. It owns no table of its own and writes
nothing; `billing_plans`, `tenant_subscriptions`, and `stripe_webhook_events` are all owned by
`BillingModule` (`src/api/billing/`), and this module is the one place any of the three gets an
admin-facing read.

**Implemented.** `src/api/admin/controllers/admin-billing.controller.ts`,
`src/api/admin/services/admin-billing.service.ts`,
`src/api/admin/swagger/admin-billing.swagger.ts`, and the `dto/` classes it composes
(`AdminBillingSummaryResponseDto`, `HasPaidTenantsResponseDto`, `BillingWebhookEventListResponseDto`)
all exist and are exercised by the frontend's Billing page (summary + webhook activity) and the
[Activity page](../admin-overview/overview.md#activity-log-a-purpose-built-write-not-a-generic-audit-trail)'s
"Webhook activity" tab, alongside `AdminBillingDbService` + `AdminBillingRepository` under
`src/db/repositories/admin-billing/`. Every route is gated by
`@Roles(JwtTokenType.PLATFORM_ADMIN)` at the controller level and re-checked in the service via
`requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY)` — same belt-and-braces pattern as
[Admin Overview](../admin-overview/overview.md).

For the endpoint-by-endpoint contract, see [Admin Billing Module — API
Reference](./api-reference.md).

## Data model

No tables are created for this module. Every figure below is a read against tables the tenant-facing
[Billing module](../billing/overview.md#data-model) owns:

| Figure | Source | Notes |
|---|---|---|
| Plan split (`freeCount`/`paidCount`) | `AdminBillingRepository.getPlanSplit()` — `GROUP BY billing_plans.code` over `tenant_subscriptions` | Every tenant has exactly one row (see the billing module's own note on `insertFreeSubscription`), so the two counts always sum to the platform's total tenant count |
| Subscription status counts | `AdminBillingRepository.getSubscriptionStatusCounts()` — `GROUP BY status` over `tenant_subscriptions WHERE status IS NOT NULL` | A pure-Free tenant that never started a checkout has `status = NULL` and is excluded from every bucket, not folded into any of them |
| `cancelingCount` | `AdminBillingRepository.getCancelingCount()` — `COUNT(*) WHERE cancel_at_period_end = true` | Still Paid and billed — see the billing module's own note on why `plan_id` doesn't flip until `customer.subscription.deleted` actually fires |
| Upgrade trend | `AdminBillingRepository.getUpgradeTrend()` — `stripe_webhook_events` rows of type `checkout.session.completed`, grouped by `EXTRACT(YEAR/MONTH FROM processed_at)`, UTC | Zero-filled to a full window before the response leaves the service, same reasoning and same `fillUpgradeTrendWindow` pattern as [Admin Overview's signup trend](../admin-overview/overview.md#signup-trend-is-zero-filled-in-the-service-not-the-repository) |
| At-risk subscriptions | `AdminBillingRepository.getAtRiskSubscriptions()` — `tenant_subscriptions WHERE status = 'past_due'`, joined to `tenants` for the display name, capped at 10, most-recently-updated first | The tenants Stripe is actively retrying a failed invoice against |
| Webhook events | `AdminBillingRepository.listWebhookEvents()` — see [Webhook activity](#webhook-activity-paginated-search-side-lists-only-the-handled-event-types) below | Paginated, filterable, and scoped to a fixed vocabulary of 5 event types |

## Webhook activity: paginated, search-side lists only the handled event types

`GET /v1/admin/billing/webhook-events` started life mid-development as a bounded top-N read
embedded inside the summary payload (`recentWebhookEvents`, capped at 10, no filter), the same
shape [Admin Overview's own activity feed](../admin-overview/overview.md#api-surface) still uses.
It moved out to its own real, paginated `page`/`pageSize`/`meta` endpoint (mirroring
`ConnectionsSyncService.listSyncRuns`'s established `PaginationMetaDto` shape) once the frontend
needed to browse the full history rather than glance at the last 10 deliveries — see
[Admin Overview's own reuse of the same shape](../admin-overview/api-reference.md#recent-activity)
for the sibling case that established the convention.

**The endpoint never surfaces raw, ignored Stripe traffic — by design, not by omission.**
`BillingWebhooksService.handleEvent` (the tenant-facing module) acts on exactly 5 Stripe event
types (`StripeWebhookEventType` in `apps/backend/src/api/billing/types/billing.type.ts`); every
other type Stripe delivers is logged and skipped as `'unhandled'`. An earlier iteration of this
endpoint accepted a `handled` boolean query param so the frontend could toggle between "acted on"
and "ignored" traffic, with a corresponding `isHandled` flag on every response row. Both were
removed: a platform admin managing tenants has no use for Stripe's internal housekeeping events
(`invoice.created`, `customer.updated`, `payment_intent.succeeded`, …), and exposing them just
buried the events that actually matter (payment succeeded/failed, checkout completed, subscription
changes) in unrelated noise. `AdminBillingRepository.listWebhookEvents` now **always** applies
`inArray(stripe_webhook_events.type, HANDLED_STRIPE_EVENT_TYPES)`, unconditionally — there is no
query param that can widen it back to the raw feed. Debugging "why didn't Stripe event X fire" is
an engineering task for Stripe's own Dashboard event log or backend logs, not something this admin
UI needs to serve.

`type` is the one remaining filter, and it narrows to one of those same 5 handled types — by this
app's own `SCREAMING_SNAKE_CASE` key name (`CHECKOUT_SESSION_COMPLETED`), never Stripe's raw dotted
wire string (`checkout.session.completed`). `ListBillingWebhookEventsQueryDto.type` maps the key to
the raw value via a `@Transform` before validation, so the URL never leaks Stripe's own naming and
everything downstream of that one DTO field keeps working with the raw string it already expected.

Owner attribution (`tenantId`/`businessName` on each row) is resolved by a `LEFT JOIN` on
`stripe_customer_id`, not an `INNER JOIN` — a delivery this app can't attribute to a known tenant
(an orphan event, or a customer id predating that column) still comes back as its own row with both
fields `null`, rather than being silently dropped from the list.

## Consumers

`useAdminBillingWebhookEvents` (`apps/web/src/hooks/admin/use-admin-billing-webhook-events.ts`)
backs the "Webhook activity" tab on the Activity page — see [Admin Console: search, pagination, and
the loading-state trap](../../frontend/admin-console.md) for the frontend pattern (server-side
`page`/`type` params, `keepPreviousData`, and why `isLoading` must map to the query's own
`isLoading`, not `isFetching`). `useAdminBilling` (`apps/web/src/hooks/admin/use-admin-billing.ts`)
backs the rest of the Billing page (summary stat cards, upgrade trend chart, at-risk list) from the
one `GET /summary` call.

## Known limitations

- **No caching**, same reasoning as [Admin Overview's own
  note](../admin-overview/overview.md#known-limitations): a handful of small, mostly-indexed
  queries fired once per page load is trivial at current volume.
- **`listWebhookEvents` has no supporting index on `stripe_customer_id` beyond what the tenant-facing
  module already created for its own idempotency lookups.** Fine at current webhook volume; revisit
  once a tenant's delivery history reaches the tens of thousands of rows.
