-- Uploaded media (avatars today). One current row per (owner, kind): an upload replaces it in
-- place.
CREATE TYPE media_kind AS ENUM (
    'avatar'
);

CREATE TABLE IF NOT EXISTS media (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    kind media_kind NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    platform_admin_id UUID REFERENCES platform_admins(id) ON DELETE CASCADE,
    -- Which StorageProvider holds the asset.
    provider VARCHAR(50) NOT NULL,
    -- The provider's own id for the asset; never returned to clients.
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

CREATE UNIQUE INDEX idx_media_user_kind ON media(user_id, kind) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_media_platform_admin_kind ON media(platform_admin_id, kind) WHERE platform_admin_id IS NOT NULL;
