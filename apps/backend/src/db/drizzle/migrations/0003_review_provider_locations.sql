CREATE TABLE IF NOT EXISTS review_provider_connections (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connected_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    provider review_provider NOT NULL DEFAULT 'google',
    provider_account_id VARCHAR(255) NOT NULL,
    credential_reference VARCHAR(255) NOT NULL,
    token_expires_at TIMESTAMPTZ,
    status google_connection_status NOT NULL DEFAULT 'active',
    -- Owner intent (disconnected on purpose), separate from status, which is credential health.
    disconnected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_provider_connections_tenant_id ON review_provider_connections(tenant_id);
CREATE INDEX idx_review_provider_connections_connected_by_user_id ON review_provider_connections(connected_by_user_id);
CREATE UNIQUE INDEX idx_review_provider_connections_tenant_provider_account ON review_provider_connections(tenant_id, provider, provider_account_id);

CREATE TABLE IF NOT EXISTS notification_recipients (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type notification_type NOT NULL DEFAULT 'escalation',
    channel notification_channel_pref NOT NULL DEFAULT 'email',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_recipients_tenant_id ON notification_recipients(tenant_id);
CREATE INDEX idx_notification_recipients_user_id ON notification_recipients(user_id);

CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_connection_id UUID NOT NULL REFERENCES review_provider_connections(id) ON DELETE CASCADE,
    provider review_provider NOT NULL DEFAULT 'google',
    external_location_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    -- The business's public phone and website from the provider; the AI reply prompt uses them so an
    -- invitation to get in touch carries real details instead of a placeholder.
    phone VARCHAR(50),
    website_uri VARCHAR(2048),
    -- Last attempt to re-read name/address/phone/website from the provider, successful or not; the poll tries at
    -- most daily, so a location Google keeps refusing costs one call a day rather than one per tick.
    details_refreshed_at TIMESTAMPTZ,
    status location_status NOT NULL DEFAULT 'active',
    last_synced_at TIMESTAMPTZ,
    last_sync_status sync_health_status,
    last_sync_error TEXT,
    onboarding_backfill_completed_at TIMESTAMPTZ,
    -- Poller high-water mark: the newest reviews.external_updated_at seen, so a poll stops paging
    -- at the first known review.
    last_review_synced_at TIMESTAMPTZ,
    -- Set when a plan's max_locations cap excludes a live location; separate from status so
    -- resuming is a plain UPDATE.
    billing_paused_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locations_tenant_id ON locations(tenant_id);
CREATE INDEX idx_locations_provider_connection_id ON locations(provider_connection_id);
CREATE UNIQUE INDEX idx_locations_provider_connection_external_location ON locations(provider_connection_id, external_location_id);
CREATE INDEX idx_locations_billing_paused_at ON locations(billing_paused_at) WHERE billing_paused_at IS NOT NULL;

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

-- The location shown on the dashboard, shared by the whole tenant. Added here so the FK target
-- exists; SET NULL so removing a location never blocks.
ALTER TABLE tenants ADD COLUMN active_location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
