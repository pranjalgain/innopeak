CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    name VARCHAR(255) NOT NULL,
    created_by_platform_admin_id UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
    status tenant_status NOT NULL DEFAULT 'pending_activation',
    -- Set when erasure is requested; NULL = none pending. The tenant is suspended meanwhile and
    -- anonymized only after the grace period.
    erasure_requested_at TIMESTAMPTZ,
    -- NULL for a platform admin's request. No FK: users is created after tenants, and the value is
    -- only compared for equality.
    erasure_requested_by_user_id UUID,
    -- Set once the 'N days left' reminder is claimed; cleared when an erasure is requested or
    -- cancelled.
    erasure_reminder_sent_at TIMESTAMPTZ,
    -- What the tenant was before an erasure request suspended it, so cancelling restores that instead of assuming 'active'
    -- (an admin's own suspension, or a tenant still 'pending_activation', must survive the round trip). NULL = none pending.
    status_before_erasure tenant_status,
    -- The most recent erasure that was cancelled, kept so a payment whose webhook arrives after the
    -- cancel can still be recognised as taken during it.
    last_erasure_requested_at TIMESTAMPTZ,
    last_erasure_cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_created_by_platform_admin_id ON tenants(created_by_platform_admin_id);
CREATE INDEX idx_tenants_status ON tenants(status);
-- The Businesses list sorts by it, and the Overview signup trend groups by it.
CREATE INDEX idx_tenants_created_at ON tenants(created_at DESC);
-- Trigram indexes back the admin `ILIKE '%term%'` searches, which a plain B-tree cannot serve (leading wildcard).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_tenants_name_trgm ON tenants USING gin (name gin_trgm_ops);
CREATE INDEX idx_tenants_erasure_requested_at ON tenants(erasure_requested_at) WHERE erasure_requested_at IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- Nullable: anonymization nulls PII in place instead of deleting the row, which keeps approver
    -- foreign keys valid.
    name VARCHAR(255),
    email VARCHAR(255),
    password_hash VARCHAR(255),
    email_verified_at TIMESTAMPTZ,
    invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    role user_role NOT NULL,
    status user_status NOT NULL,
    anonymized_at TIMESTAMPTZ,
    -- Set when removal of this member is requested; access ends now, anonymization after the grace
    -- period.
    erasure_requested_at TIMESTAMPTZ,
    -- What the user was before the removal request disabled them, so cancelling restores it: an admin's own deactivation must not be
    -- undone by an owner requesting and then cancelling a removal. NULL = none pending.
    status_before_removal user_status,
    -- NULL means the user never chose a language; Accept-Language decides.
    locale user_locale,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE UNIQUE INDEX idx_users_tenant_id_email ON users(tenant_id, email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_name_trgm ON users USING gin (name gin_trgm_ops);
CREATE INDEX idx_users_created_at ON users(created_at DESC);
CREATE INDEX idx_users_invited_by_user_id ON users(invited_by_user_id);
CREATE INDEX idx_users_erasure_requested_at ON users(erasure_requested_at) WHERE erasure_requested_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS tenant_settings (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    escalation_rating_threshold INTEGER NOT NULL DEFAULT 3,
    auto_post_enabled BOOLEAN NOT NULL DEFAULT false,
    review_data_retention_months INTEGER,
    ai_reply_count SMALLINT NOT NULL DEFAULT 2,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tenant_settings_escalation_rating_threshold_check CHECK (escalation_rating_threshold BETWEEN 1 AND 5),
    CONSTRAINT tenant_settings_ai_reply_count_check CHECK (ai_reply_count BETWEEN 1 AND 3)
);

CREATE UNIQUE INDEX idx_tenant_settings_tenant_id ON tenant_settings(tenant_id);

CREATE TABLE IF NOT EXISTS blocklist_terms (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    term VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blocklist_terms_tenant_id ON blocklist_terms(tenant_id);
CREATE UNIQUE INDEX idx_blocklist_terms_tenant_id_lower_term ON blocklist_terms(tenant_id, lower(term));

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
