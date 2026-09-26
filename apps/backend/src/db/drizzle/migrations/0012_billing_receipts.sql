-- Migration: billing_receipts
-- Created at: 2026-09-25T04:29:22.000Z
--
-- One row per successfully paid Stripe invoice, captured from the `invoice.payment_succeeded`
-- webhook. Before this migration, `BillingWebhooksService` used that event only to sync
-- `tenant_subscriptions.status` and discarded the invoice's own amount/currency/number entirely —
-- there was nowhere to persist them. This table exists solely so a tenant can download a PDF
-- receipt for a past payment from Settings → Billing (`GET /v1/billing/receipts`,
-- `GET /v1/billing/receipts/:id/pdf`).
-- Stripe-only: `DummyPaymentProvider` has no real charge behind it and never produces a real
-- `invoice.payment_succeeded` webhook delivery, so no row is ever written for a Dummy-provider
-- tenant — its receipt history is simply empty.
-- Depends on: 0002_tenant_auth.sql (tenants). Deliberately does not reference
-- tenant_subscriptions/billing_plans: a receipt documents a specific historical payment and must
-- stay readable even if the tenant's plan or subscription state changes afterward.

-- ───────────────────────────────────────────────────────────────────────
-- billing_receipts — depends on: tenants
-- ───────────────────────────────────────────────────────────────────────
-- Keyed on our own uuidv7() id, not Stripe's invoice id — the PDF download route addresses a
-- receipt by that id. `stripe_invoice_id` stays a separate unique column instead, the same
-- "our own id for routing, Stripe's id for idempotency/lookup" shape as
-- tenant_subscriptions.stripe_customer_id/stripe_subscription_id.

CREATE TABLE IF NOT EXISTS billing_receipts (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stripe_invoice_id VARCHAR(255) NOT NULL,
    -- Nullable: Stripe's `invoice.subscription` can be null for a one-off invoice, though every
    -- invoice this app currently produces belongs to the tenant's one subscription.
    stripe_subscription_id VARCHAR(255),
    -- Smallest currency unit (e.g. cents), matching Stripe's own `amount_paid` verbatim — never a
    -- float, to avoid rounding drift on a value that must exactly match what was actually charged.
    amount_paid INTEGER NOT NULL,
    -- Lowercase ISO 4217 code, matching Stripe's own `currency` field verbatim (e.g. 'usd').
    currency VARCHAR(3) NOT NULL,
    -- Stripe's own human-readable invoice number (e.g. '8E8B7F1-0001'). Nullable defensively —
    -- every invoice this app has seen carries one by the time it's paid, but nothing guarantees a
    -- future Stripe invoice state will.
    invoice_number VARCHAR(255),
    paid_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_billing_receipts_stripe_invoice_id ON billing_receipts(stripe_invoice_id);
CREATE INDEX idx_billing_receipts_tenant_id ON billing_receipts(tenant_id);
