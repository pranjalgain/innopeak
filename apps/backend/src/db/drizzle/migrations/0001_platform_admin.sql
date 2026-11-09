CREATE TABLE IF NOT EXISTS platform_admins (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    invited_by_platform_admin_id UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
    status platform_admin_status NOT NULL,
    -- NULL means the admin never chose a language; Accept-Language decides.
    locale user_locale,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_platform_admins_email ON platform_admins(email);
CREATE INDEX idx_platform_admins_invited_by_platform_admin_id ON platform_admins(invited_by_platform_admin_id);

-- Only the seeded root admin may have no inviter.
CREATE UNIQUE INDEX idx_platform_admins_single_root ON platform_admins((TRUE)) WHERE invited_by_platform_admin_id IS NULL;

CREATE TABLE IF NOT EXISTS platform_admin_identities (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    platform_admin_id UUID NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
    provider user_identity_provider NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_admin_identities_platform_admin_id ON platform_admin_identities(platform_admin_id);
CREATE UNIQUE INDEX idx_platform_admin_identities_provider_provider_user_id ON platform_admin_identities(provider, provider_user_id);

CREATE TABLE IF NOT EXISTS platform_admin_auth_tokens (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    platform_admin_id UUID NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    purpose platform_admin_invite_purpose NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_admin_auth_tokens_platform_admin_id ON platform_admin_auth_tokens(platform_admin_id);
CREATE UNIQUE INDEX idx_platform_admin_auth_tokens_token_hash ON platform_admin_auth_tokens(token_hash);
-- One live row per (admin, purpose): a resent code updates it.
CREATE UNIQUE INDEX idx_platform_admin_auth_tokens_platform_admin_id_purpose ON platform_admin_auth_tokens(platform_admin_id, purpose);
