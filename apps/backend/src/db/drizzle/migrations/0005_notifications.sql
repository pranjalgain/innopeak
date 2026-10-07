CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    generation_group_id UUID,
    type notification_type NOT NULL DEFAULT 'escalation',
    channel notification_channel NOT NULL,
    status notification_status NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_tenant_id ON notifications(tenant_id);
CREATE INDEX idx_notifications_review_id ON notifications(review_id);
CREATE INDEX idx_notifications_recipient_user_id ON notifications(recipient_user_id);
CREATE INDEX idx_notifications_generation_group_id ON notifications(generation_group_id);

-- generation_group_id scopes this to one escalation event: a retried send is blocked, a later re-
-- escalation is not. NULLs are distinct, so it must be set for escalations.
CREATE UNIQUE INDEX idx_notifications_review_recipient_type ON notifications(review_id, recipient_user_id, type, generation_group_id);

-- The in-app feed users read and acknowledge themselves; separate from the per-channel delivery
-- ledger in notifications.
CREATE TYPE in_app_notification_type AS ENUM (
    'review_escalated',
    'reply_needs_approval',
    'reply_approved',
    'connection_issue'
);

CREATE TABLE IF NOT EXISTS in_app_notifications (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type in_app_notification_type NOT NULL,
    -- Frozen at creation so a later wording change never rewrites history.
    title VARCHAR(255) NOT NULL,
    description TEXT,
    -- Nullable: connection_issue has no review.
    review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
    notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
    generation_group_id UUID,
    -- NULL = unread.
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_in_app_notifications_tenant_id ON in_app_notifications(tenant_id);
CREATE INDEX idx_in_app_notifications_review_id ON in_app_notifications(review_id);
CREATE INDEX idx_in_app_notifications_user_created ON in_app_notifications(user_id, created_at DESC, id DESC);
CREATE INDEX idx_in_app_notifications_user_unread ON in_app_notifications(user_id) WHERE read_at IS NULL;
-- NULLs are distinct, so connection_issue rows (no review or group) are never deduplicated; each
-- incident is a new notice.
CREATE UNIQUE INDEX idx_in_app_notifications_dedupe ON in_app_notifications(user_id, type, review_id, generation_group_id);
