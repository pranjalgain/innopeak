-- Migration: billing
-- Created at: 2026-09-23T10:24:49.477Z
--
-- Free/Paid subscription plans, charged through Stripe (or a `DummyPaymentProvider` in dev/test —
-- see `apps/backend/src/api/billing/providers/`). Whether billing exists at all in a given
-- deploy is controlled by a single deploy-level env var (`PAYMENT_FEATURE_ENABLED`, see
-- `env.config.ts`) — there is deliberately no separate runtime-toggleable DB flag for this: one
-- switch, not two, since a second admin-facing toggle only adds a state (env on, DB off — or vice
-- versa) nobody actually needs to distinguish.
-- Depends on: 0002_tenant_auth.sql (tenants), 0004_reviews.sql (review_responses, for the AI-draft
-- usage cap), 0003_review_provider_locations.sql (locations.billing_paused_at, added there
-- directly rather than here, so the column sits with the table it belongs to).
--
-- Enums declared locally per 0006_prompts.sql's own precedent — CREATE TYPE for a module added
-- after the original six-file set is ordinary schema evolution, not a forward reference.

-- ═══════════════════════════════════════════════════════════════════════
-- Enum types
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE billing_plan_code AS ENUM ('free', 'paid');
-- Deliberately a subset of Stripe's own subscription statuses: 'trialing'/'incomplete_expired'/
-- 'unpaid' are omitted because no code path in v1 produces them (there is no trial period) — add a
-- value only once a real path needs it, per this schema's own no-speculative-enum-members habit
-- (see review_provider, notification_type).
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'canceled', 'incomplete');

-- ───────────────────────────────────────────────────────────────────────
-- billing_plans — no dependencies
-- ───────────────────────────────────────────────────────────────────────
-- A seeded catalog, not an admin-managed resource — exactly two rows for the lifetime of this
-- schema version. Entitlements live directly on this row rather than a separate
-- plan_entitlements table: with a cardinality of 2, and entitlements that never change
-- independently of which plan they belong to, normalizing them out would only add a join for
-- every entitlement check with no offsetting benefit (the same reasoning that keeps tenant_settings'
-- own config columns on tenant_settings itself rather than a side table).

CREATE TABLE IF NOT EXISTS billing_plans (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    code billing_plan_code NOT NULL UNIQUE,
    -- Both NULL for 'free' — no Stripe object backs a plan with no price.
    stripe_product_id VARCHAR(255),
    stripe_price_id VARCHAR(255),
    -- NULL means unlimited (Paid's row), matching this schema's own "NULL = unbounded" idiom.
    max_locations SMALLINT,
    max_ai_drafts_per_month SMALLINT,
    max_team_members SMALLINT,
    custom_prompts_enabled BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent: a second run must not fail trying to insert a row that already exists.
INSERT INTO billing_plans (code, max_locations, max_ai_drafts_per_month, max_team_members, custom_prompts_enabled)
VALUES ('free', 1, 20, 1, false)
ON CONFLICT (code) DO NOTHING;
INSERT INTO billing_plans (code, max_locations, max_ai_drafts_per_month, max_team_members, custom_prompts_enabled)
VALUES ('paid', NULL, NULL, NULL, true)
ON CONFLICT (code) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────
-- tenant_subscriptions — depends on: tenants, billing_plans
-- ───────────────────────────────────────────────────────────────────────
-- One row per tenant, always present — created in the same transaction as the tenant itself
-- (AuthService.signup), defaulting to the 'free' plan, so "which plan is this tenant on" never
-- needs a null-check anywhere it's read.

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- RESTRICT, not CASCADE/SET NULL: a tenant must never end up pointing at a deleted plan, and
    -- plans aren't deletable via any API this schema defines anyway.
    plan_id UUID NOT NULL REFERENCES billing_plans(id) ON DELETE RESTRICT,
    -- Both nullable — a pure-Free tenant that has never started a checkout has neither.
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    -- Nullable for the same reason: no Stripe subscription object, no status to report.
    status subscription_status,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    -- True while a tenant has canceled but is still inside the period they already paid for —
    -- `plan_id` stays 'paid' and entitlements stay unlimited until Stripe actually ends the
    -- subscription (customer.subscription.deleted), which is the one event that flips `plan_id`
    -- back to 'free'. See BillingWebhooksService's own doc comment for the full state machine.
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    -- Last time this row was confirmed in sync with Stripe: stamped by a webhook-driven write, by
    -- the synchronous checkout-redirect reconciliation, and by the nightly reconciliation sweep —
    -- including when either of the last two confirms the tenant is still genuinely free, which is
    -- as much a verification as a state change. NULL = never verified.
    stripe_last_verified_at TIMESTAMPTZ,
    -- Stamped each time a Checkout Session is created for this tenant. Bounds the nightly
    -- reconciliation sweep: a payment can only land within a Checkout Session's lifetime of this,
    -- so a tenant whose last checkout started days ago has nothing left to reconcile and drops out
    -- of the sweep instead of being re-queried against Stripe every night forever.
    checkout_started_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_tenant_subscriptions_tenant_id ON tenant_subscriptions(tenant_id);
CREATE INDEX idx_tenant_subscriptions_plan_id ON tenant_subscriptions(plan_id);
CREATE INDEX idx_tenant_subscriptions_status ON tenant_subscriptions(status);
CREATE UNIQUE INDEX idx_tenant_subscriptions_stripe_customer_id ON tenant_subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX idx_tenant_subscriptions_stripe_subscription_id ON tenant_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────
-- stripe_webhook_events — no dependencies
-- ───────────────────────────────────────────────────────────────────────
-- Idempotency ledger for inbound Stripe webhooks, per Stripe's own recommended pattern: insert the
-- event id first, and treat a conflict (0 rows returned) as "already processed, skip" rather than
-- re-applying a retried delivery. Keyed on Stripe's own event id (e.g. 'evt_...'), not uuidv7() —
-- the one table in this schema keying on an externally-issued id rather than one it mints itself.

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(255) NOT NULL,
    -- NULL for a 'unhandled' event (see `PaymentWebhookEvent`) — those carry no `customerId` at
    -- all. Lets the admin-facing webhook-activity view resolve which tenant an event was for by
    -- joining against `tenant_subscriptions.stripe_customer_id`, without this table needing its
    -- own FK to `tenants` (a webhook can arrive for a customer id this app never resolves).
    stripe_customer_id VARCHAR(255),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
