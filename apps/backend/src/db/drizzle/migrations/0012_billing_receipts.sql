-- One row per paid Stripe invoice (invoice.payment_succeeded). Not tied to tenant_subscriptions, so
-- a receipt stays readable after the plan changes.
CREATE TABLE IF NOT EXISTS billing_receipts (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stripe_invoice_id VARCHAR(255) NOT NULL,
    stripe_subscription_id VARCHAR(255),
    -- Smallest currency unit (cents), as Stripe reports it.
    amount_paid INTEGER NOT NULL,
    -- Lowercase ISO 4217 code.
    currency VARCHAR(3) NOT NULL,
    invoice_number VARCHAR(255),
    paid_at TIMESTAMPTZ NOT NULL,
    -- TRUE when the payment succeeded after the tenant's erasure was requested and while it was
    -- pending: the one refund-due case. Computed by the INSERT that records the receipt.
    paid_after_erasure_request BOOLEAN NOT NULL DEFAULT FALSE,
    -- Set when an admin has handled a flagged receipt (refunded it or decided not to); a to-do
    -- marker, not a refund ledger.
    refund_resolved_at TIMESTAMPTZ,
    refund_resolved_by_admin_id UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_billing_receipts_stripe_invoice_id ON billing_receipts(stripe_invoice_id);
CREATE INDEX idx_billing_receipts_tenant_id ON billing_receipts(tenant_id);
-- The admin Billing page's queue.
CREATE INDEX idx_billing_receipts_unresolved_post_erasure ON billing_receipts(paid_at DESC)
    WHERE paid_after_erasure_request AND refund_resolved_at IS NULL;
