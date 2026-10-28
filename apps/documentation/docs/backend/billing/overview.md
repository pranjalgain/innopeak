---
sidebar_position: 1
---

# Billing Module

## Overview

The billing module adds the product's first monetization layer: two subscription plans (Free and
Paid), charged through Stripe, with a platform-wide switch a Super Admin can flip to control
whether *new* tenants are offered billing at all. Before this module, every tenant got unlimited
use of every feature — there was no plan, no cap, and no Stripe object anywhere in the schema.

**Implemented.** `src/api/billing/controllers/billing.controller.ts` (tenant-facing, owner-only)
and `billing-webhooks.controller.ts` (Stripe-only), `services/billing.service.ts` (plans/checkout/
portal orchestration), `services/billing-webhooks.service.ts` (the Stripe event state machine),
`services/billing-entitlements.service.ts` (the four enforcement checks plus the §3a
location-selection methods), `providers/` (the `PaymentProvider` plugin pair), and the `dto/`/
`exceptions/`/`swagger/`/`types/` files that support them all exist and are wired into three other
modules' services. Data access lives in `src/db/repositories/billing/`
(`billing-plans.repository.ts`/`.db-service.ts`, `tenant-subscriptions.repository.ts`/
`.db-service.ts`, `stripe-webhook-events.db-service.ts`), plus one column added to an existing
domain — `locations.billing_paused_at`.

For the endpoint-by-endpoint contract, see [Billing Module — API Reference](./api-reference.md).

## Data model

Three new tables, from `apps/backend/src/db/drizzle/migrations/0011_billing.sql`, plus two columns
added directly to existing migration files rather than a follow-up `ALTER` (this repo's own
migrations-are-edited-in-place convention — see that file's own header comment and
`apps/backend/CLAUDE.md`'s note on `0008_platform_settings`/`0003_review_provider_locations`):

| Table / column | Notes |
|---|---|
| `billing_plans` | Seeded catalog, not admin-managed — exactly two rows (`free`, `paid`) for the lifetime of this schema version. Entitlements (`max_locations`, `max_ai_drafts_per_month`, `max_team_members`, `custom_prompts_enabled`) live directly on the row rather than a separate `plan_entitlements` table, since there are only ever two rows and entitlements never change independently of the plan itself. `NULL` on any `max_*` column means unlimited. `stripe_product_id`/`stripe_price_id` are both `NULL` for `free` — no Stripe object backs a plan with no price |
| `tenant_subscriptions` | One row per tenant, always present — created in the same transaction as the tenant itself (`AuthDbService.signup`/`completeGoogleSignup`, via `TenantSubscriptionsDbService.insertFreeSubscription`), defaulting to the `free` plan. "Which plan is this tenant on" never needs a null-check anywhere it's read. `stripe_customer_id`/`stripe_subscription_id`/`status`/period fields are all nullable — a pure-Free tenant that has never started a checkout has none of them. Two more nullable timestamps support missed-webhook recovery (see [§ Recovering from a missed webhook](#recovering-from-a-missed-webhook)): `stripe_last_verified_at` (last time the row was confirmed against Stripe, by any path) and `checkout_started_at` (last time a Checkout Session was created, which bounds the nightly sweep) |
| `stripe_webhook_events` | Idempotency ledger, Stripe's own recommended pattern — insert the event id first (`id VARCHAR(255) PRIMARY KEY`, Stripe's own event id string, not `uuidv7()`), treat a conflict as "already processed, skip." The one table in this schema keyed on an externally-issued id |
| `locations.billing_paused_at` | `TIMESTAMPTZ`, nullable, added directly to `0003_review_provider_locations.sql`. See [§ Downgrading with multiple locations](#downgrading-with-multiple-locations--the-location-choice-mechanism) for why this is a new column rather than reusing `status` or `tenants.active_location_id` |

## Free vs Paid: a hybrid usage-cap + feature-lock split

The two plans are seeded once by `0011_billing.sql`:

| Entitlement | Free | Paid |
|---|---|---|
| Locations | 1 | Unlimited |
| AI-generated reply drafts / month | 20 | Unlimited |
| Team members | 1 (owner only, no invites) | Unlimited (invites unlocked) |
| Custom prompt template editing | Off (default prompt/tone only) | On (full template/tone/version-history editing) |

This is deliberately a **hybrid** model, not a single philosophy applied uniformly: locations,
AI drafts, and team members are **usage caps** (a number that scales with how much value a tenant
is getting), while custom prompt editing is a flat **feature lock** (a capability that either
exists for a tenant or doesn't, with no meaningful "how many" to cap). Caching this distinction
in the schema — three `SMALLINT` columns that mean "how many" and one `BOOLEAN` that means
"can/can't" — is what lets `BillingEntitlementsService`'s four check methods stay one-liners
(`count < max` for the caps, a plain field read for the lock) instead of each needing its own
bespoke comparison logic.

**What counts as an AI draft.** The monthly counter is `countAiGeneratedResponsesThisMonth`: every `review_responses` row created this UTC
month whose `source` is `ai_generated` **or** `human_edited`. An owner who edits a draft before approving it turns it into `human_edited`;
it still cost an LLM call, so it keeps its slot (counting `ai_generated` alone let editing hand the slot back and left the Free cap of 20
unenforced). A reply written by hand (`human_manual`) or imported from Google is never counted. None of this matters while payments are off:
the counter is only ever compared against `maxAiDraftsPerMonth`, and `BillingEntitlementsService` returns `null` (unlimited) for every
limit when `PAYMENT_FEATURE_ENABLED` is not `'true'`, so with the feature off there is no cap on drafts, locations, team members or prompts.

## Stripe event ordering, reconcile writes and erasure cancellation (audit follow-ups)

- **A checkout never erases the billing period.** A `checkout.session.completed` payload carries no period, so `setToPaidFromCheckout` takes the
  period fields as optional and the webhook leaves them out: a missing value keeps what an earlier `customer.subscription.updated` stored
  (an explicit `null` still clears it). Overwriting them with NULL used to hand the erasure resume path an "unknown" period end.
- **A dropped checkout is asked of Stripe, not lost.** If a newer, unrelated event already moved the tenant's event clock, the completed Checkout
  is still not written (a newer cancellation must not be undone by an older event), but it is the only event that binds the customer to its
  subscription and the Paid plan, so once the webhook's transaction commits `BillingWebhooksService` runs `reconcileTenantSubscription` for
  that tenant and Stripe's current state decides. A failure there is logged and the nightly sweep covers it.
- **Reconcile writes go through the same event clock.** The checkout-redirect reconcile and the nightly sweep stamp the clock with the moment
  *before* Stripe was asked (`readAt`) and write only if that is still the newest. A snapshot read before a `subscription.deleted` was applied
  would otherwise resurrect Paid for a tenant who just cancelled. The clock update also serializes it with webhook writes. The two clocks are
  Stripe's `created` and ours, so a few seconds of skew can make a snapshot be refused; the next sweep retakes it.
- **Erasure stops billing even without a recorded subscription.** `scheduleCancellationForErasure` used to return when no subscription id was
  stored (a checkout whose webhook had not landed), leaving the tenant billed through the grace period (up to 21 days). It now asks Stripe for the
  customer's live subscription. The request-time call is still best-effort and only logs, so the nightly `BILLING_RECONCILIATION_SWEEP` also
  retries it for every business pending erasure whose subscription is not yet set to end
  (`findPendingErasureWithBillableSubscription`).

## More audit follow-ups: statuses, price id, owner cancel and ledger retention

- **`unpaid` and `incomplete_expired` end the plan.** Stripe sends no `customer.subscription.deleted` for them, and both used to be read as `INCOMPLETE`,
  so a tenant whose card kept failing stayed on the Paid plan forever. `STRIPE_STATUS_MAP` now reads them as `canceled` (and `trialing` as `active`), and
  `handleSubscriptionUpdated` treats an update to `canceled` exactly like a deletion: back to Free, location cap re-applied, owners told about paused locations.
  (`prepareNewCheckout` no longer counts `unpaid` or `incomplete` as live: a tenant on Free would otherwise be told "already subscribed" while the plan had already ended, so they are cancelled in Stripe and the Checkout carries on. The cancels run after the tenant's checkout lock is released (`cancelStaleSubscriptions`): inside it, each Stripe round trip held a database connection and the advisory lock. Only `active`, `trialing` and `past_due` block a new Checkout, which is what stops Back from Checkout buying a second one.)
- **An empty `STRIPE_PRICE_ID_PAID` is "not configured".** `??` let `STRIPE_PRICE_ID_PAID=` shadow the plan's own price id, reaching Stripe as an empty price after
  a customer had already been created. It is now `||`, and with no price anywhere checkout answers `503 PAYMENT_NOT_CONFIGURED` before any Stripe call.
- **A failed owner cancel puts back what it replaced.** The owner's cancellation overwrote an erasure-scheduled one (source `erasure`) and a failed Stripe call
  then cleared it outright, so cancelling the erasure later would resume, and bill, a subscription meant to end. It now restores the previous flag and source.
- **Ledger retention.** `stripe_webhook_events` rows older than 90 days are deleted by the nightly billing sweep (Stripe redelivers for three days), and the Stripe
  customer id is removed from `tenant_subscriptions` once the customer has been deleted at erasure.

## The payment switch is a deploy-level env var, not per-business, and never retroactive

Whether billing exists at all is one environment variable, `PAYMENT_FEATURE_ENABLED`, not a table column or a runtime toggle: wiring
up Stripe is a deploy-time fact, so there is deliberately no second, admin-editable copy that could disagree with it. (An earlier
design stored `platform_settings.billing_enabled`; that column is gone.)

`isPaymentFeatureEnabled(configService)` (`src/api/billing/utils/payment-feature.util.ts`) reads it, and it is applied in three places:

- **`BillingService.createCheckoutSession`** is the only billing route it gates: off, it throws `BillingNotEnabledException`
  (`403 BILLING_NOT_ENABLED`). `createPortalSession` deliberately does **not** check it, so an already-Paid tenant keeps full
  Customer Portal access — the switch gates the *entry point* (starting an upgrade), never existing access.
- **`BillingEntitlementsService`** lifts every plan limit while it is off (`limitsApply` is false), so a deploy without payments
  never blocks a tenant on Free-plan caps.
- **`GET /v1/settings/platform-config`** reflects it as `paymentFeatureEnabled`, which the web uses to show or hide every
  payment-related surface (plan choice at signup, the Billing tab, the admin Billing page).

## The payment provider

`PaymentProvider` (`src/api/billing/providers/payment.provider.ts`) is an abstract base class with a
single implementation, `StripePaymentProvider`, bound in `billing-reconciliation.module.ts`. There
is no simulated provider: upgrades, cancellation and the billing profile all talk to Stripe (test
mode locally).

`StripePaymentProvider` uses the `stripe` npm SDK: real Checkout session creation, and real
signature verification via `stripe.webhooks.constructEvent`. It maps Stripe's own event/status
shapes into this app's normalized `PaymentWebhookEvent`/`SubscriptionStatus` types
(`STRIPE_STATUS_MAP` in `stripe-payment.provider.ts`) so `BillingWebhooksService` never touches a
raw Stripe type.

The Stripe client is built lazily, because the SDK throws on an empty key at construction. A server
with no Stripe keys therefore still boots (Free tenants never touch billing), and any billing call
that needs Stripe fails with `PAYMENT_NOT_CONFIGURED` (`503`). `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` are required whenever `PAYMENT_FEATURE_ENABLED=true`, in every environment
including production, and not needed otherwise: a production install with payments off starts with no
Stripe keys. `STRIPE_PRICE_ID_PAID` names the Paid plan's price.

## Webhook state machine

`BillingWebhooksService.handleEvent` (`src/api/billing/services/billing-webhooks.service.ts`) is
idempotent per Stripe event id (insert-first into `stripe_webhook_events`, `ON CONFLICT DO
NOTHING` — zero rows returned means "already processed, skip"), then dispatches on event type.
**Downgrade-to-free on cancellation is explicit, not implied by status alone**:

| Event | Effect |
|---|---|
| `checkout.session.completed` | Attach `stripe_subscription_id`, set `plan_id` to `paid`, clear `billing_paused_at` on every one of the tenant's locations (Paid has no location cap) — **only when the payment has settled** (`payment_status` `paid` or `no_payment_required`). A Checkout that completes before its payment does (a delayed method such as SEPA debit reports `unpaid`) is recorded and acknowledged without upgrading; `checkout.session.async_payment_succeeded`, normalized to this same event, upgrades once the payment clears. |
| `customer.subscription.updated` | Sync `status`/`current_period_start`/`current_period_end`/`cancel_at_period_end` only — `plan_id` is deliberately untouched. A tenant who has canceled but is still inside their paid period arrives here with `cancelAtPeriodEnd: true` and `status: 'active'`; `plan_id` **stays** `paid` and entitlements stay unlimited — they keep what they already paid for. It also clears `cancellation_source` when the flag arrives `false` (the subscription renews again); while the flag is still `true` the source is left as it was written — a webhook cannot know who asked. |
| `customer.subscription.deleted` | Fires when Stripe actually ends the subscription (at period end, or immediately if canceled outside a grace period). **This is the one write that flips `plan_id` back to `free`** and clears `stripe_subscription_id`/`status`/period fields. Entitlement checks read `plan_id`, not `status` — forgetting this write would leave a canceled tenant permanently reading as `paid` with unlimited access. Also calls `BillingEntitlementsService.enforceLocationLimitOnDowngrade`. |
| `invoice.payment_failed` / `invoice.payment_succeeded` | `status` only (`past_due` / `active`) — no email queuing in v1. |

### Webhooks arrive unordered — `tenant_subscriptions.stripe_last_event_at`

Stripe does not deliver events in the order they happened, so a late `past_due` could overwrite a newer `active`, or a
late `checkout.session.completed` resurrect Paid after a `deleted`. Every event that changes billing state first moves
the tenant's `stripe_last_event_at` forward to its own Stripe `created` time in one atomic update
(`TenantSubscriptionsRepository.advanceEventClock`); an event **older** than the newest one already applied is stale and
is acknowledged without writing. An event from the same second counts as current, since `created` has second resolution
and there is no order to recover. A late `invoice.payment_succeeded` leaves the status alone but still records its
receipt, since that is a record of a payment that happened. The redirect/sweep reconciliation paths do not move the clock
(they read live state from Stripe, and comparing Stripe's clock with ours could drop a legitimate event).

**Stripe endpoint setup:** the webhook endpoint must also be subscribed to `checkout.session.async_payment_succeeded`
(alongside the five types above), or a tenant paying by a delayed method is only upgraded by the redirect/nightly
reconciliation, not by the webhook.

### Who cancelled — `tenant_subscriptions.cancellation_source`

`cancel_at_period_end` alone cannot say *who* set it, and that decides whether it may be undone.
`cancellation_source` (`owner` | `erasure`, `NULL` when not ending or never recorded) is written
**before** the provider call and reverted if it fails:

| Written by | Source | Cleared by |
|---|---|---|
| `POST /v1/billing/cancel` (Billing → Cancel) | `owner` | a `subscription.updated` arriving with the flag `false`; `checkout.session.completed`; `subscription.deleted` |
| An admin's erasure request on an `active` subscription | `erasure` | the same, or the admin cancelling the erasure (which resumes it) |
| A Customer Portal cancel (we never wrote it) | `NULL` — treated as the owner's | the same |

Only an `erasure` cancellation is ever resumed by cancelling the erasure, and only while the paid
period has not run out; an owner's (or unattributed) cancellation never is, because resuming it
would renew — and charge — something they chose to end. A `past_due` subscription is not marked at
all: an erasure request cancels it immediately and voids its open invoices. Ending a subscription *at
period end* uses a fresh Stripe idempotency key on every call (a fixed one made cancel → resume →
cancel again inside 24 hours silently skip the second cancel, since Stripe replays a key's first
response for a day).

Every branch resolves the tenant by Stripe customer/subscription id. A customer id no
`tenant_subscriptions` row matches **throws** (`StripeWebhookTenantNotFoundException`, HTTP 404)
instead of being swallowed: the `stripe_webhook_events` ledger insert and the handler's writes share
one transaction, so the throw rolls the ledger row back too and Stripe retries the delivery, rather
than the event being marked "processed" with nothing written. That retry is bounded — once an
unknown-customer event is older than `UNKNOWN_CUSTOMER_RETRY_GRACE_MS` (1 hour) it is acknowledged
and logged instead, since a customer this database still doesn't know after that long never will
(a shared Stripe account, a wiped local database), and failing it for days risks Stripe disabling
the endpoint. The one deliberate silent no-op is a genuinely stale, out-of-order event for a
subscription the tenant has since superseded. The webhook route is exempt from the global rate
limiter (`@SkipThrottle()`), since a burst of Stripe retries after an outage must not be answered
with `429`.

## Recovering from a missed webhook

Webhooks are the primary path, but they can be missed (the server was down past Stripe's retry
window) or delayed (the user is back on the success page before the event arrives). Two more paths
read Stripe directly and apply the result through the same `setToPaidFromCheckout` write the webhook
uses, so all three converge on identical state in any order:

1. **Checkout-redirect reconciliation.** `createCheckoutSession`'s `success_url` carries Stripe's
   `{CHECKOUT_SESSION_ID}` template token as `session_id`. When the Settings page loads with
   `checkout=success&session_id=…`, the frontend calls `POST /v1/billing/checkout/reconcile`, which
   retrieves the session from Stripe and verifies `session.metadata.tenantId` matches the caller
   (a mismatch is a `404`, so one tenant cannot probe another's session).
2. **Nightly sweep** (`CronJobName.BILLING_RECONCILIATION_SWEEP`, daily 5am,
   `CronService.reconcileStaleBillingSubscriptions`) for a user who never returns to the page.
   Candidates are free-plan tenants with a Stripe customer whose last checkout started within 4
   days (`checkout_started_at` — a session lives 24h and Stripe retries for up to 3 days) and that
   haven't been verified in the last hour. Each is checked in its own `try/catch`, so one Stripe
   failure does not starve the rest. A customer id Stripe doesn't know counts as no subscription, so
   such a row is stamped verified rather than failing every night.

Both paths only apply a **live** subscription (`active` or `past_due`). A `canceled` one means the
subscription behind an old success URL has since ended, and an `incomplete` one means the first
payment hasn't been captured — applying either would grant Paid to a tenant who is not paying. In
those cases, as when Stripe reports no subscription at all, only `stripe_last_verified_at` is
stamped. Applying a snapshot (plan, subscription fields, clearing `billing_paused_at`, the verified
stamp) is one transaction. The worker process loads only
`BillingReconciliationModule` (payment provider + reconciliation service), not the full
`BillingModule`.

Out of scope: detecting a missed *renewal* webhook on an already-Paid subscription. The sweep only
targets the free-but-has-a-Stripe-customer signature.

## Downgrading with multiple locations — the location-choice mechanism

`findLocationsDueForPoll` (`src/db/repositories/connections/connections.repository.ts`) is a live
query, re-run every 15-minute poll tick, with no prior concept of "paused but still connected" —
before this module, even a fully suspended tenant's locations kept polling, since the query never
joined to `tenants`/billing state at all. `locations.billing_paused_at` is genuinely new, not a
repurposing of anything existing: `findLocationsDueForPoll` now also excludes rows where
`billing_paused_at IS NOT NULL` (alongside its existing `status = 'active'` check), and
`countActiveUnpausedLocations`/`ConnectionsService.assertLocationLimit` count only
`status = 'active' AND billing_paused_at IS NULL` locations against the plan cap — a paused
location doesn't count against it, since it's already excluded from active use.

**Why not `tenants.active_location_id`?** That column (the Business Switcher's "which business is
currently shown" pointer, added in `0003_review_provider_locations.sql`) is a pure UI default with
an explicit "falls back silently, nothing breaks if stale" contract (`ON DELETE SET NULL`, no
`NOT NULL`), and has zero coupling to polling today. It's the wrong tool for a hard entitlement
constraint — a billing pause needs to be authoritative and durable, not a soft UI fallback — so
`BillingEntitlementsService` uses the dedicated `locations.billing_paused_at` column instead.
`active_location_id` is still consulted, though: it's a *reasonable signal* of which business the
owner actually cares about, so it's preferred as the tie-break when auto-picking which location to
keep (see below).

**On downgrade** (`BillingEntitlementsService.enforceLocationLimitOnDowngrade`, called from inside
the `customer.subscription.deleted` handler after `plan_id` has already flipped to `free`): if the
tenant's count of active, unpaused locations exceeds the new plan's `max_locations`, it:

1. Prefers `tenants.active_location_id` if it's among the tenant's currently-unpaused active
   locations; otherwise falls back to the *oldest-connected* location — each location's own
   `created_at`, not the shared `review_provider_connections.created_at` the original plan
   proposed, since several locations confirmed together via one OAuth connection would otherwise
   tie on the same connection timestamp with no real tie-break.
2. Sets `billing_paused_at = now()` on every other active, unpaused location for that tenant, in
   the same call (`ConnectionsDbService.applyBillingLocationSelection`).
3. Logs the outcome (kept/paused location ids) — see
   [Known limitations](#known-limitations--follow-up-work) for the not-yet-built owner
   notification.

**Changing the active selection at any time**: `PUT /v1/billing/active-location` (owner-only) →
`BillingEntitlementsService.setActiveLocationForPlan` validates the given `locationId` belongs to
the tenant and is `status = 'active'` (throwing `LocationNotEligibleForActivationException`
otherwise), then atomically pauses/unpauses so exactly `max_locations` locations stay unpaused at
once — never more. A no-op when the plan has no cap at all (Paid).

**On upgrade back to Paid**: `checkout.session.completed`'s handler clears `billing_paused_at` on
every one of the tenant's locations — Paid has no location cap, so nothing stays paused.

## Enforcement: where the four entitlement checks are wired in

**Only while payments are on.** With `PAYMENT_FEATURE_ENABLED` off there is no way to upgrade, so
`BillingEntitlementsService.getEntitlements` lifts every plan limit for every tenant instead of
locking them into Free: `maxLocations`, `maxAiDraftsPerMonth` and `maxTeamMembers` read `null`
(unlimited) and `customPromptsEnabled` reads `true`. `GET /v1/billing/plans` reports the same lifted limits, so the
onboarding plan step never advertises caps that are not enforced. `planCode` is still reported as stored, and a
downgrade to Free pauses no location (`enforceLocationLimitOnDowngrade` returns early). Every check
below goes through `getEntitlements`, so they all follow. Locations already paused by an earlier
downgrade stay paused.

When payments are turned back on, the Free location cap is applied again: at startup the API (only the API:
`FreePlanCapModule` is imported by `AppModule`, never the worker) runs `reapplyFreeLocationCap`. One query finds the
Free tenants with more active, unpaused locations than the cap (usually none), and `enforceLocationLimitOnDowngrade`
pauses the extras for each, exactly as a downgrade does: idempotent, locked per tenant, never blocking boot. Team
members and past AI usage are not retroactive: their caps only block further additions.

Whenever the cap pauses locations (a downgrade or this re-application), every owner gets a "locations paused" email
in their own language (`LOCATIONS_PAUSED_EMAIL`, `locations-paused.copy.ts`) naming the paused and the still-active
locations, with a link to Settings → Billing. It is sent only once the pause is committed:
`enforceLocationLimitOnDowngrade` returns what it paused instead of sending, and the subscription-deleted webhook
sends after its transaction commits, so no email goes out for a downgrade that rolls back and the transaction's locks
are never held across queue calls. Sending is best-effort: the pause stands even if the email can't be queued.

`BillingEntitlementsService` is exported from `BillingModule` (not `@Global()` — imported
explicitly by the modules that need it, the same way `AuthModule` imports `MediaModule`) and
injected into three other modules' business services:

| Check | Call site | On failure |
|---|---|---|
| `canAddLocation` | `ConnectionsService.assertLocationLimit` (`src/api/connections/services/connections.service.ts:639`) — the pre-check before confirming new locations, replacing the old hardcoded `MAX_ACTIVE_LOCATIONS` sanity ceiling. `ConnectionsDbService.confirmLocations`'s own race-safe, lock-held recheck also reads `entitlements.maxLocations` (`?? Number.MAX_SAFE_INTEGER` for unlimited), not just the pre-check | `LocationLimitReachedException` (403) |
| `canInviteTeamMember` | `TenantMembersService.sendInvite` (`src/api/settings/services/tenant-members.service.ts:82`) — independent of, and in addition to, the existing `platformSettingsDbService.get().inviteMembersEnabled` platform-off check | `TeamMemberLimitReachedException` (403), kept distinct from `MemberInvitesDisabledException` (platform-off) since the frontend needs different upsell copy for each |
| `canEditCustomPrompt` | `PromptsService.createVersion` (`src/api/prompts/prompts.service.ts:83`) — checked before the existing placeholder-validation logic even looks at the submitted template | `CustomPromptsNotOnPlanException` (403) |

## Known limitations / follow-up work

- **No owner-notification email on an auto-picked downgrade yet.**
  `enforceLocationLimitOnDowngrade`'s `queueDowngradeNotification` only logs which location was
  kept/paused (`this.logger.log(...)`) instead of queuing a real email through the existing
  BullMQ/SQS email-queue pipeline (`src/background/`). Its own doc comment calls this out as
  deliberate, isolated follow-up work — wiring a genuinely new email type through the full
  producer → processor → Handlebars-template pipeline needs its own review and was out of this
  task's required verification scope.
