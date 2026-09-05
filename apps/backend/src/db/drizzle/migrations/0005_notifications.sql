-- Migration: notifications
-- Google Business Profile Review Management — notifications module
-- Source of truth: apps/backend/docs/PLAN.md + apps/backend/docs/schema.dbml
-- Depends on: 0000_foundation.sql (enum types, log_db_changes()), 0002_tenant_auth.sql
--   (tenants, users), 0004_reviews.sql (reviews)

-- ───────────────────────────────────────────────────────────────────────
-- notifications — depends on: tenants, reviews, users
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    generation_group_id UUID,
    type notification_type NOT NULL,
    channel notification_channel NOT NULL,
    status notification_status NOT NULL,
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_tenant_id ON notifications(tenant_id);
CREATE INDEX idx_notifications_review_id ON notifications(review_id);
CREATE INDEX idx_notifications_recipient_user_id ON notifications(recipient_user_id);
CREATE INDEX idx_notifications_generation_group_id ON notifications(generation_group_id);

-- Scoped to (..., generation_group_id) rather than just (review_id, recipient_user_id, type) —
-- see PLAN.md §8.13. A review can legitimately escalate more than once over its lifetime (e.g.
-- superseded and reclassified per §8.6/§8.12); each escalation gets its own generation_group_id,
-- so this still blocks a duplicate/retried send within one escalation event without permanently
-- blocking every escalation after the first for that review. Relies on generation_group_id being
-- reliably populated for the 'escalation' notification_type (Postgres treats NULLs in a unique
-- index as distinct from each other, so a NULL here would silently stop being deduplicated at all).
CREATE UNIQUE INDEX idx_notifications_review_recipient_type ON notifications(review_id, recipient_user_id, type, generation_group_id);

CREATE TRIGGER notifications_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON notifications
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();
