-- Migration: review_provider_locations
-- Google Business Profile Review Management — review provider connections & locations module
-- Source of truth: apps/backend/docs/PLAN.md + apps/backend/docs/schema.dbml
-- Depends on: 0000_foundation.sql (enum types, log_db_changes()), 0002_tenant_auth.sql
--   (tenants, users)

-- ───────────────────────────────────────────────────────────────────────
-- review_provider_connections — depends on: tenants, users
-- (renamed from an originally Google-only "google_connections" — generalized to any
--  review-source provider; the app dispatches to a provider-specific implementation
--  based on the `provider` column, mirroring this codebase's existing Provider/Strategy
--  pattern for Email/SMS/AI)
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS review_provider_connections (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connected_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    provider review_provider NOT NULL,
    provider_account_id VARCHAR(255) NOT NULL,
    credential_reference VARCHAR(255) NOT NULL,
    token_expires_at TIMESTAMPTZ,
    status google_connection_status NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_provider_connections_tenant_id ON review_provider_connections(tenant_id);
CREATE INDEX idx_review_provider_connections_connected_by_user_id ON review_provider_connections(connected_by_user_id);
CREATE UNIQUE INDEX idx_review_provider_connections_tenant_provider_account ON review_provider_connections(tenant_id, provider, provider_account_id);

CREATE TRIGGER review_provider_connections_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON review_provider_connections
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();

-- ───────────────────────────────────────────────────────────────────────
-- notification_recipients — depends on: tenants, users
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_recipients (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type notification_type NOT NULL,
    channel notification_channel_pref NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_recipients_tenant_id ON notification_recipients(tenant_id);
CREATE INDEX idx_notification_recipients_user_id ON notification_recipients(user_id);

CREATE TRIGGER notification_recipients_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON notification_recipients
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();

-- ───────────────────────────────────────────────────────────────────────
-- locations — depends on: tenants, review_provider_connections
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_connection_id UUID NOT NULL REFERENCES review_provider_connections(id) ON DELETE CASCADE,
    provider review_provider NOT NULL,
    external_location_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    status location_status NOT NULL,
    last_synced_at TIMESTAMPTZ,
    last_sync_status sync_health_status,
    last_sync_error TEXT,
    onboarding_backfill_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locations_tenant_id ON locations(tenant_id);
CREATE INDEX idx_locations_provider_connection_id ON locations(provider_connection_id);
CREATE UNIQUE INDEX idx_locations_provider_connection_external_location ON locations(provider_connection_id, external_location_id);

CREATE TRIGGER locations_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON locations
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();

-- ───────────────────────────────────────────────────────────────────────
-- user_locations — depends on: users, locations
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_locations (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_locations_user_id ON user_locations(user_id);
CREATE INDEX idx_user_locations_location_id ON user_locations(location_id);
CREATE UNIQUE INDEX idx_user_locations_user_id_location_id ON user_locations(user_id, location_id);

CREATE TRIGGER user_locations_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON user_locations
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();
