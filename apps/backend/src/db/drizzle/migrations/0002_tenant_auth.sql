-- Migration: tenant_auth
-- Google Business Profile Review Management — tenant provisioning & user auth module
-- Source of truth: apps/backend/docs/PLAN.md + apps/backend/docs/schema.dbml
-- Depends on: 0000_foundation.sql (enum types, log_db_changes()), 0001_platform_admin.sql
--   (tenants.created_by_platform_admin_id references platform_admins)

-- ───────────────────────────────────────────────────────────────────────
-- tenants — depends on: platform_admins (nullable — only set for support-created tenants)
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    name VARCHAR(255) NOT NULL,
    created_by_platform_admin_id UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
    status tenant_status NOT NULL DEFAULT 'pending_activation',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_created_by_platform_admin_id ON tenants(created_by_platform_admin_id);
CREATE INDEX idx_tenants_status ON tenants(status);

CREATE TRIGGER tenants_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON tenants
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();

-- ───────────────────────────────────────────────────────────────────────
-- tenant_identity_providers — depends on: tenants
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_identity_providers (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider tenant_identity_provider NOT NULL,
    provider_tenant_id VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenant_identity_providers_tenant_id ON tenant_identity_providers(tenant_id);
CREATE UNIQUE INDEX idx_tenant_identity_providers_provider_tenant_id ON tenant_identity_providers(provider, provider_tenant_id);

CREATE TRIGGER tenant_identity_providers_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON tenant_identity_providers
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();

-- ───────────────────────────────────────────────────────────────────────
-- users — depends on: tenants
-- ───────────────────────────────────────────────────────────────────────

-- invited_by_user_id is a self-reference, which needs no special handling — it's nullable and
-- the column and its own table exist together in this single CREATE TABLE. NULL for a
-- self-registered owner (§4.3a) and for a platform-admin-provisioned owner (§4.3d, whose
-- inviter is a platform_admins row, not a users row); set only when a member is invited by an
-- owner (§4.3b), which is the only case where the inviter genuinely is another users row.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    email_verified_at TIMESTAMPTZ,
    invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    role user_role NOT NULL,
    status user_status NOT NULL,
    anonymized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE UNIQUE INDEX idx_users_tenant_id_email ON users(tenant_id, email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_invited_by_user_id ON users(invited_by_user_id);

CREATE TRIGGER users_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();

-- ───────────────────────────────────────────────────────────────────────
-- tenant_settings — depends on: tenants
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_settings (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    escalation_rating_threshold INTEGER NOT NULL,
    auto_post_enabled BOOLEAN NOT NULL DEFAULT false,
    review_data_retention_months INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tenant_settings_escalation_rating_threshold_check CHECK (escalation_rating_threshold BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX idx_tenant_settings_tenant_id ON tenant_settings(tenant_id);

CREATE TRIGGER tenant_settings_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON tenant_settings
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();

-- ───────────────────────────────────────────────────────────────────────
-- blocklist_terms — depends on: tenants
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS blocklist_terms (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    term VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blocklist_terms_tenant_id ON blocklist_terms(tenant_id);
CREATE UNIQUE INDEX idx_blocklist_terms_tenant_id_lower_term ON blocklist_terms(tenant_id, lower(term));

CREATE TRIGGER blocklist_terms_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON blocklist_terms
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();

-- ───────────────────────────────────────────────────────────────────────
-- user_identities — depends on: users
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_identities (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider user_identity_provider NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_identities_user_id ON user_identities(user_id);
CREATE UNIQUE INDEX idx_user_identities_provider_provider_user_id ON user_identities(provider, provider_user_id);

CREATE TRIGGER user_identities_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON user_identities
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();

-- ───────────────────────────────────────────────────────────────────────
-- password_reset_tokens — depends on: users
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    purpose token_purpose NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE UNIQUE INDEX idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);

CREATE TRIGGER password_reset_tokens_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON password_reset_tokens
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();
