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
`.db-service.ts`, `stripe-webhook-events.db-service.ts`), plus two columns added to existing
domains — `platform_settings.billing_enabled` and `locations.billing_paused_at`.

For the endpoint-by-endpoint contract, see [Billing Module — API Reference](./api-reference.md).

## Data model

Three new tables, from `apps/backend/src/db/drizzle/migrations/0011_billing.sql`, plus two columns
added directly to existing migration files rather than a follow-up `ALTER` (this repo's own
migrations-are-edited-in-place convention — see that file's own header comment and
`apps/backend/CLAUDE.md`'s note on `0008_platform_settings`/`0003_review_provider_locations`):

| Table / column | Notes |
|---|---|
| `billing_plans` | Seeded catalog, not admin-managed — exactly two rows (`free`, `paid`) for the lifetime of this schema version. Entitlements (`max_locations`, `max_ai_drafts_per_month`, `max_team_members`, `custom_prompts_enabled`) live directly on the row rather than a separate `plan_entitlements` table, since there are only ever two rows and entitlements never change independently of the plan itself. `NULL` on any `max_*` column means unlimited. `stripe_product_id`/`stripe_price_id` are both `NULL` for `free` — no Stripe object backs a plan with no price |
| `tenant_subscriptions` | One row per tenant, always present — created in the same transaction as the tenant itself (`AuthDbService.signup`/`completeGoogleSignup`, via `TenantSubscriptionsDbService.insertFreeSubscription`), defaulting to the `free` plan. "Which plan is this tenant on" never needs a null-check anywhere it's read. `stripe_customer_id`/`stripe_subscription_id`/`status`/period fields are all nullable — a pure-Free tenant that has never started a checkout has none of them |
| `stripe_webhook_events` | Idempotency ledger, Stripe's own recommended pattern — insert the event id first (`id VARCHAR(255) PRIMARY KEY`, Stripe's own event id string, not `uuidv7()`), treat a conflict as "already processed, skip." The one table in this schema keyed on an externally-issued id |
| `platform_settings.billing_enabled` | `BOOLEAN NOT NULL DEFAULT false`, added directly to `0008_platform_settings.sql` alongside the other four platform toggles (`sso_login_enabled`/`password_login_enabled`/`social_login_enabled`/`invite_members_enabled`) |
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

## The platform flag is global, not per-business, and never retroactive

`platform_settings.billing_enabled` is a single platform-wide switch, not a per-tenant column —
the same singleton-settings table and pattern already used for `sso_login_enabled`/
`password_login_enabled`/`social_login_enabled`/`invite_members_enabled`. A Super Admin flips one
switch for the whole platform rather than opting individual businesses in.

`BillingService.createCheckoutSession` is the **only** place this flag is read
(`platformSettings?.billingEnabled !== true` throws `BillingNotEnabledException`,
`src/api/billing/services/billing.service.ts:80-83`). `createPortalSession` deliberately does
**not** check it — its own doc comment says so explicitly: "an already-Paid tenant keeps full
Customer Portal access regardless of the platform-wide switch." This is what makes disabling the
flag non-retroactive: it gates the *entry point* (starting a new upgrade), never an
already-subscribed tenant's existing access to manage or cancel what they already have.

**A gap found while documenting this, not by design**: `platform_settings.billing_enabled` exists
end-to-end at the schema and repository layer (`PlatformSettingsRow.billingEnabled`,
`src/db/repositories/platform-settings/platform-settings.repository.ts`) and is read by
`BillingService.createCheckoutSession`, but it is **not yet exposed on either platform-settings
DTO** — `UpdatePlatformSettingsDto`
(`src/api/admin/dto/update-platform-settings.dto.ts`) and `PlatformSettingsResponseDto`
(`src/api/settings/dto/platform-settings-response.dto.ts`) both still list only the original four
booleans. As shipped, there is no HTTP path for a Super Admin to actually flip this switch, or for
any client to read its current value — the column can only be changed directly at the database.
See [Known limitations](#known-limitations--follow-up-work).

## The payment-provider plugin pattern: Dummy vs Stripe

`PaymentProvider` (`src/api/billing/providers/payment.provider.ts`) is an abstract base class with
two concrete implementations, selected by the `PAYMENT_PROVIDER` env var (`dummy` | `stripe`,
default `dummy`) via a factory in `billing.module.ts` — the same DI-swap shape as
`StorageProvider` → `CloudinaryStorageProvider`/`NoopStorageProvider` in
`src/api/media/providers/`.

- **`DummyPaymentProvider`** — the default. Mints fabricated ids (`dummy_cus_<uuid>`,
  `dummy_sub_<uuid>`), and `createCheckoutSession`/`createPortalSession` return a URL pointing at a
  local confirmation page (`/billing/dummy-checkout`, `/billing/dummy-portal`, under
  `FRONTEND_URL`) instead of a real Stripe redirect. `constructWebhookEvent` throws if called —
  Dummy has no external caller to deliver a webhook, so the (not-yet-built) confirmation pages are
  expected to call the same internal service methods a real webhook would trigger, directly.
- **`StripePaymentProvider`** — the real integration, via the `stripe` npm SDK: real Checkout/
  Portal session creation, and real signature verification via `stripe.webhooks.constructEvent`.
  Maps Stripe's own event/status shapes into this app's normalized `PaymentWebhookEvent`/
  `SubscriptionStatus` types (`STRIPE_STATUS_MAP` in `stripe-payment.provider.ts`) so
  `BillingWebhooksService` never touches a raw Stripe type.

The reason this exists as a plugin rather than a single Stripe integration: it lets the entire
upgrade → cap-enforcement → cancel → downgrade flow be built and exercised end-to-end with zero
real Stripe keys. Ship wired to Dummy; flip `PAYMENT_PROVIDER=stripe` (plus
`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_ID_PAID`) once real Stripe objects exist.
Dummy is the default (unlike `STORAGE_PROVIDER` defaulting to `noop` for a different reason,
per `billing.module.ts`'s own comment) because shipping real, unwanted Stripe traffic before real
keys/webhook secrets exist is actively harmful, whereas Dummy is a fully working simulated flow on
its own.

## Webhook state machine

`BillingWebhooksService.handleEvent` (`src/api/billing/services/billing-webhooks.service.ts`) is
idempotent per Stripe event id (insert-first into `stripe_webhook_events`, `ON CONFLICT DO
NOTHING` — zero rows returned means "already processed, skip"), then dispatches on event type.
**Downgrade-to-free on cancellation is explicit, not implied by status alone**:

| Event | Effect |
|---|---|
| `checkout.session.completed` | Attach `stripe_subscription_id`, set `plan_id` to `paid`, clear `billing_paused_at` on every one of the tenant's locations (Paid has no location cap). |
| `customer.subscription.updated` | Sync `status`/`current_period_start`/`current_period_end`/`cancel_at_period_end` only — `plan_id` is deliberately untouched. A tenant who has canceled but is still inside their paid period arrives here with `cancelAtPeriodEnd: true` and `status: 'active'`; `plan_id` **stays** `paid` and entitlements stay unlimited — they keep what they already paid for. |
| `customer.subscription.deleted` | Fires when Stripe actually ends the subscription (at period end, or immediately if canceled outside a grace period). **This is the one write that flips `plan_id` back to `free`** and clears `stripe_subscription_id`/`status`/period fields. Entitlement checks read `plan_id`, not `status` — forgetting this write would leave a canceled tenant permanently reading as `paid` with unlimited access. Also calls `BillingEntitlementsService.enforceLocationLimitOnDowngrade`. |
| `invoice.payment_failed` / `invoice.payment_succeeded` | `status` only (`past_due` / `active`) — no email queuing in v1. |

Every branch resolves the tenant by Stripe customer/subscription id and no-ops (with a warning
logged) if none is found, rather than throwing — an orphan event (a customer/subscription this app
never created, or a race with an as-yet-uncommitted Checkout) must not fail the webhook and
trigger endless Stripe retries for something that will never resolve.

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

`BillingEntitlementsService` is exported from `BillingModule` (not `@Global()` — imported
explicitly by the modules that need it, the same way `AuthModule` imports `MediaModule`) and
injected into three other modules' business services:

| Check | Call site | On failure |
|---|---|---|
| `canAddLocation` | `ConnectionsService.assertLocationLimit` (`src/api/connections/services/connections.service.ts:639`) — the pre-check before confirming new locations, replacing the old hardcoded `MAX_ACTIVE_LOCATIONS` sanity ceiling. `ConnectionsDbService.confirmLocations`'s own race-safe, lock-held recheck also reads `entitlements.maxLocations` (`?? Number.MAX_SAFE_INTEGER` for unlimited), not just the pre-check | `LocationLimitReachedException` (403) |
| `canInviteTeamMember` | `TenantMembersService.sendInvite` (`src/api/settings/services/tenant-members.service.ts:82`) — independent of, and in addition to, the existing `platformSettingsDbService.get().inviteMembersEnabled` platform-off check | `TeamMemberLimitReachedException` (403), kept distinct from `MemberInvitesDisabledException` (platform-off) since the frontend needs different upsell copy for each |
| `canEditCustomPrompt` | `PromptsService.createVersion` (`src/api/prompts/prompts.service.ts:83`) — checked before the existing placeholder-validation logic even looks at the submitted template | `CustomPromptsNotOnPlanException` (403) |
| `canGenerateAiDraft` | Both `AiReplyGenerationService.generateDryRunReply` (never persists, so it can never move the count it checks) and `generateForClassifiedReviews` (`src/api/ai/ai-reply-generation.service.ts`, wired into `ReviewSyncQueueService`'s 15-minute poll tick, which does persist an `ai_generated` row on every success) — see [AI Module § Billing entitlement check](../ai/overview.md#billing-entitlement-check-everywhere-generation-can-run) | `AiDraftLimitReachedException` (403) |

## Known limitations / follow-up work

- **`generateDryRunReply`'s quota check is real but structurally inert on its own.** It calls
  `canGenerateAiDraft` before generating, same as the real generation path, but a dry run never
  persists a `review_responses` row — so on its own it could never move the count it checks. That
  stopped being the whole picture once `generateForClassifiedReviews` shipped alongside it
  (`src/api/ai/ai-reply-generation.service.ts`, wired into `ReviewSyncQueueService`'s poll tick):
  that path persists an `ai_generated` row on every successful draft, so `aiDraftsUsedThisMonth`
  is live in practice — a dry run just never contributes to it either way.
- **No owner-notification email on an auto-picked downgrade yet.**
  `enforceLocationLimitOnDowngrade`'s `queueDowngradeNotification` only logs which location was
  kept/paused (`this.logger.log(...)`) instead of queuing a real email through the existing
  BullMQ/SQS email-queue pipeline (`src/background/`). Its own doc comment calls this out as
  deliberate, isolated follow-up work — wiring a genuinely new email type through the full
  producer → processor → Handlebars-template pipeline needs its own review and was out of this
  task's required verification scope.
- **`billing_enabled` has no admin-facing API surface yet.** As documented
  [above](#the-platform-flag-is-global-not-per-business-and-never-retroactive), the column and its
  enforcement in `BillingService.createCheckoutSession` are both live, but
  `UpdatePlatformSettingsDto`/`PlatformSettingsResponseDto` don't include the field. A Super Admin
  cannot currently toggle it, and no client can read its value, through any HTTP route — only a
  direct database update changes it today.
