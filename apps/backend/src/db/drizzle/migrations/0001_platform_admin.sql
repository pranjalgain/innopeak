-- Migration: platform_admin
-- Google Business Profile Review Management — platform admin module
-- Source of truth: apps/backend/docs/PLAN.md + apps/backend/docs/schema.dbml
-- Depends on: 0000_foundation.sql (enum types)
--
-- platform_admins is the SaaS-level support/ops hierarchy — fully separate from the
-- tenant-scoped `users` table (PLAN.md §2), no FK to any tenant table anywhere in this file.
-- Its own invited_by_platform_admin_id is a self-reference, which needs no special handling —
-- valid within a single CREATE TABLE since Postgres only checks FK validity at row-insert
-- time, not at table-creation time.

-- ───────────────────────────────────────────────────────────────────────
-- platform_admins — independent (no FK to any other table)
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_admins (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    invited_by_platform_admin_id UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
    status platform_admin_status NOT NULL,
    -- Nullable, no default: Settings' Profile tab shows the InnoPeak logo/an initial until an
    -- admin uploads one, same as a tenant owner with no avatar today.
    avatar_url VARCHAR(2048),
    -- Reuses `user_locale` (0000_foundation.sql) rather than a second identical enum — the type
    -- is a generic two-value locale domain, not something `users` owns exclusively. NULL means
    -- "never chose," same reasoning as `users.locale`'s own comment: a DEFAULT would silently pin
    -- every existing admin to one language instead of letting Accept-Language decide for them.
    locale user_locale,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_platform_admins_email ON platform_admins(email);
CREATE INDEX idx_platform_admins_invited_by_platform_admin_id ON platform_admins(invited_by_platform_admin_id);

-- At most one row may have invited_by_platform_admin_id IS NULL — the single seeded root admin
-- (PLAN.md §2). Every subsequently invited admin must record who invited them.
CREATE UNIQUE INDEX idx_platform_admins_single_root ON platform_admins((TRUE)) WHERE invited_by_platform_admin_id IS NULL;

-- ───────────────────────────────────────────────────────────────────────
-- platform_admin_identities — depends on: platform_admins
-- ───────────────────────────────────────────────────────────────────────

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

-- ───────────────────────────────────────────────────────────────────────
-- platform_admin_invites — depends on: platform_admins
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_admin_invites (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    platform_admin_id UUID NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    purpose platform_admin_invite_purpose NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_platform_admin_invites_platform_admin_id ON platform_admin_invites(platform_admin_id);
CREATE UNIQUE INDEX idx_platform_admin_invites_token_hash ON platform_admin_invites(token_hash);
