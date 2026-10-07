CREATE TYPE platform_activity_type AS ENUM (
    'business_suspended',
    'business_reactivated',
    'admin_invite_sent',
    'admin_invite_revoked',
    'user_activated',
    'user_deactivated',
    'admin_disabled',
    'admin_enabled',
    'business_erasure_requested',
    'business_erasure_cancelled',
    'business_erased'
);

CREATE TABLE IF NOT EXISTS platform_activity_log (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    type platform_activity_type NOT NULL,
    -- SET NULL: removing an admin must not remove the record of their actions; actor_email is what
    -- renders.
    actor_platform_admin_id UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
    actor_email VARCHAR(255) NOT NULL,
    -- A pointer only, deliberately outside the CHECK: a hard-deleted tenant sets it NULL, which the
    -- CHECK must not block.
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    -- Snapshot at write time; the tenant may later be renamed or deleted.
    business_name VARCHAR(255),
    -- A plain value, not a FK: a revoked invite's row is deleted but the log must still name it.
    target_email VARCHAR(255),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- One arm per event family, pinning every column the entry renders from.
    CONSTRAINT platform_activity_log_target_check CHECK (
        (type IN ('business_suspended', 'business_reactivated', 'business_erasure_requested', 'business_erasure_cancelled', 'business_erased') AND business_name IS NOT NULL AND target_email IS NULL) OR
        (type IN ('admin_invite_sent', 'admin_invite_revoked', 'admin_disabled', 'admin_enabled') AND target_email IS NOT NULL AND business_name IS NULL AND tenant_id IS NULL) OR
        (type IN ('user_activated', 'user_deactivated') AND target_email IS NOT NULL AND business_name IS NOT NULL)
    )
);

CREATE INDEX idx_platform_activity_log_occurred_at ON platform_activity_log(occurred_at DESC);
CREATE INDEX idx_platform_activity_log_actor_platform_admin_id ON platform_activity_log(actor_platform_admin_id);
CREATE INDEX idx_platform_activity_log_tenant_id ON platform_activity_log(tenant_id);
