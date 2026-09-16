-- Migration: tenant_auth
-- Google Business Profile Review Management — tenant provisioning & user auth module
-- Source of truth: apps/backend/docs/PLAN.md + apps/backend/docs/schema.dbml
-- Depends on: 0000_foundation.sql (enum types), 0001_platform_admin.sql
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
    -- NULL means "never chose" — that's what makes Accept-Language negotiation legitimate for
    -- this user. A DEFAULT 'en' would silently pin every existing/self-registered user to English
    -- instead of letting the request's own header decide.
    locale user_locale,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE UNIQUE INDEX idx_users_tenant_id_email ON users(tenant_id, email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_invited_by_user_id ON users(invited_by_user_id);

-- ───────────────────────────────────────────────────────────────────────
-- tenant_settings — depends on: tenants
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_settings (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- DEFAULT 3 so the product default lives in exactly one place. Without it the column was
    -- NOT NULL with no default, forcing every writer to restate the number — signup's
    -- insertTenantSettings and the dev-admin migration both did, with nothing keeping them in
    -- step. Edited here rather than added as a follow-up ALTER: nothing is deployed, so a local
    -- database is recreated rather than upgraded. Recreate yours if it predates this line —
    -- drizzle never re-reads an applied migration, so it will not pick this up on its own.
    escalation_rating_threshold INTEGER NOT NULL DEFAULT 3,
    auto_post_enabled BOOLEAN NOT NULL DEFAULT false,
    review_data_retention_months INTEGER,
    -- How many AI-drafted reply variants to generate per review — Settings' AI tab. DEFAULT 1
    -- for the same reason as escalation_rating_threshold above. Added by editing this file rather
    -- than as a follow-up ALTER, same convention as that column — but note this one is *queried*
    -- (tenant_settings.repository selects it), so a database that predates this line does not
    -- merely lack a default: `GET`/`PUT /v1/settings` will fail outright with
    -- `column "ai_reply_count" does not exist`. Recreate yours (`pnpm db:dev:rm && pnpm db:dev:up`,
    -- then `pnpm db:migrate`) — drizzle never re-reads an applied migration, so `db:migrate`
    -- alone reports success and changes nothing.
    ai_reply_count SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tenant_settings_escalation_rating_threshold_check CHECK (escalation_rating_threshold BETWEEN 1 AND 5),
    CONSTRAINT tenant_settings_ai_reply_count_check CHECK (ai_reply_count BETWEEN 1 AND 3)
);

CREATE UNIQUE INDEX idx_tenant_settings_tenant_id ON tenant_settings(tenant_id);

-- ───────────────────────────────────────────────────────────────────────
-- blocklist_terms — depends on: tenants
-- ───────────────────────────────────────────────────────────────────────

-- No `is_active`: a term is either configured or it is removed, and removal is a hard DELETE.
-- The column existed and was never written by any code path — the Blocklist tab only adds and
-- removes — so it read as "every stored term is active" while inviting a reader to assume the
-- classifier filtered on it. It does not. Dropped rather than filtered, so the schema cannot
-- imply a mute feature the product does not have. The audit trigger below preserves the history
-- a soft delete would have kept, and `reviews.matched_keywords` stores matched terms as plain
-- text with no FK, so removing a term never orphans the escalation it caused.
CREATE TABLE IF NOT EXISTS blocklist_terms (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    term VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blocklist_terms_tenant_id ON blocklist_terms(tenant_id);
CREATE UNIQUE INDEX idx_blocklist_terms_tenant_id_lower_term ON blocklist_terms(tenant_id, lower(term));

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
