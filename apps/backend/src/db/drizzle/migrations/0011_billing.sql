CREATE TYPE billing_plan_code AS ENUM ('free', 'paid');
-- A subset of Stripe's statuses: only those some code path produces.
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'canceled', 'incomplete');
CREATE TYPE subscription_cancellation_source AS ENUM ('owner', 'erasure');

-- Seeded catalog of exactly two rows; entitlements live on the row and NULL limits mean unlimited.
CREATE TABLE IF NOT EXISTS billing_plans (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    code billing_plan_code NOT NULL UNIQUE,
    stripe_product_id VARCHAR(255),
    stripe_price_id VARCHAR(255),
    max_locations SMALLINT,
    max_ai_drafts_per_month SMALLINT,
    max_team_members SMALLINT,
    custom_prompts_enabled BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO billing_plans (code, max_locations, max_ai_drafts_per_month, max_team_members, custom_prompts_enabled)
VALUES ('free', 1, 20, 1, false)
ON CONFLICT (code) DO NOTHING;
INSERT INTO billing_plans (code, max_locations, max_ai_drafts_per_month, max_team_members, custom_prompts_enabled)
VALUES ('paid', NULL, NULL, NULL, true)
ON CONFLICT (code) DO NOTHING;

-- One row per tenant, always present (created with the tenant) and defaulting to the free plan.
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES billing_plans(id) ON DELETE RESTRICT,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    status subscription_status,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    -- Canceled but still inside the paid period: plan_id stays 'paid' until Stripe sends
    -- customer.subscription.deleted.
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    -- Who set cancel_at_period_end. NULL when not ending, or never recorded (a Customer Portal
    -- cancel, treated as the owner's). Only 'erasure' is resumed when an erasure is cancelled.
    cancellation_source subscription_cancellation_source,
    -- Last time this row was confirmed in sync with Stripe; NULL = never.
    stripe_last_verified_at TIMESTAMPTZ,
    -- Bounds the nightly reconciliation sweep to tenants with a recent checkout.
    checkout_started_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_tenant_subscriptions_tenant_id ON tenant_subscriptions(tenant_id);
CREATE INDEX idx_tenant_subscriptions_plan_id ON tenant_subscriptions(plan_id);
CREATE INDEX idx_tenant_subscriptions_status ON tenant_subscriptions(status);
CREATE UNIQUE INDEX idx_tenant_subscriptions_stripe_customer_id ON tenant_subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX idx_tenant_subscriptions_stripe_subscription_id ON tenant_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Idempotency ledger for inbound webhooks, keyed on Stripe's event id: a conflicting insert means
-- already processed.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(255) NOT NULL,
    -- NULL for unhandled events, which carry no customer.
    stripe_customer_id VARCHAR(255),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
