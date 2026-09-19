-- Migration: media
-- A generic, provider-agnostic table for uploaded media — avatars today, extensible to future
-- purposes via `kind` without another schema change. Depends on: 0001_platform_admin.sql
-- (platform_admins), 0002_tenant_auth.sql (users).
--
-- Ownership is a nullable-FK-pair + CHECK, the same shape `platform_activity_log`
-- (0009_admin_overview.sql) already uses for "one of two owner tables" — not a generic
-- (owner_type, owner_id) polymorphic pair, since an untyped id column can never be a real FK and
-- loses referential integrity and ON DELETE CASCADE behavior. `platform_admins.avatar_url`
-- (0001_platform_admin.sql) is retired by this migration in favor of a row here, so both owner
-- tables reach avatars through the exact same path rather than a tenant user's avatar working
-- differently from a platform admin's.
--
-- One current row per (owner, kind) — replace-in-place, not history. Uploading a new avatar
-- updates this same row, and only once that write has committed does the application layer delete
-- the displaced provider asset (that order matters: the reverse would leave a row pointing at an
-- asset that is already gone if the write then failed). Nothing here enforces that deletion — it
-- is a provider call, not a DB constraint — but the unique index below is what makes "the owner's
-- current avatar" a well-defined single row to update rather than a set that needs a separate
-- "is this the current one" flag.

CREATE TYPE media_kind AS ENUM (
    'avatar'
);

CREATE TABLE IF NOT EXISTS media (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    kind media_kind NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    platform_admin_id UUID REFERENCES platform_admins(id) ON DELETE CASCADE,
    -- Which StorageProvider stored this asset ('cloudinary' today) — needed at delete/replace
    -- time to know how to reach the asset again; a later S3 provider's rows and a Cloudinary
    -- provider's rows can coexist in this same table without either needing to guess the other's
    -- shape.
    provider VARCHAR(50) NOT NULL,
    -- The provider's own id for this asset (Cloudinary's public_id) — opaque to everything above
    -- the provider layer, kept only so a later delete/replace can hand it back to that same
    -- provider. Never returned to a client; only `url` is.
    provider_asset_id VARCHAR(255) NOT NULL,
    url VARCHAR(2048) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT media_exactly_one_owner CHECK (
        (user_id IS NOT NULL AND platform_admin_id IS NULL) OR
        (user_id IS NULL AND platform_admin_id IS NOT NULL)
    )
);

-- Doubles as the lookup index for "this owner's current avatar" — a unique constraint on
-- (owner, kind) is exactly the "at most one current row" rule the header above describes, so no
-- separate index is needed to serve that same query.
CREATE UNIQUE INDEX idx_media_user_kind ON media(user_id, kind) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_media_platform_admin_kind ON media(platform_admin_id, kind) WHERE platform_admin_id IS NOT NULL;
