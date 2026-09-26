-- Migration: review_provider_locations
-- Google Business Profile Review Management — review provider connections & locations module
-- Source of truth: apps/backend/docs/PLAN.md + apps/backend/docs/schema.dbml
-- Depends on: 0000_foundation.sql (enum types), 0002_tenant_auth.sql
--   (tenants, users)
--
-- ⚠ RECREATE YOUR DATABASE AFTER PULLING A CHANGE TO THIS FILE.
-- Per the repo convention this file is edited in place rather than followed by an ALTER
-- migration, and drizzle's migrator walks meta/_journal.json by timestamp and never re-reads a
-- file it has already applied. On an existing database `pnpm db:migrate` therefore reports
-- success and changes nothing — silently. `tenants.active_location_id` (added below, alongside
-- multi-location support) is read by AuthRepository.findActiveLocationId on the
-- GET /v1/connections path, so a stale database does not fail at migrate time; it fails at
-- runtime with `column "active_location_id" does not exist`, taking out the dashboard guard,
-- Settings and onboarding resume together.
--
-- `locations.billing_paused_at` (added below for the billing module's plan location cap) is the
-- second such column, and has a wider blast radius than the first: on a stale database the review
-- queue (ReviewsReadRepository.listReviews / findReviewByIdForTenant), the dashboard
-- (DashboardRepository.findActiveLocationIds), the plan-cap checks
-- (countActiveUnpausedLocations, setLocationsBillingPaused, clearBillingPauseForTenant) and the
-- every-15-minutes review-sync cron (findLocationsDueForPoll) all fail at runtime with
-- `column "billing_paused_at" does not exist`. Nothing fails at migrate time, so the only signal
-- is the app breaking after deploy.
--   pnpm backend:down && pnpm backend:up && pnpm db:migrate

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
    -- `review_provider` has exactly one value; the repository hardcoded it at every insert.
    provider review_provider NOT NULL DEFAULT 'google',
    provider_account_id VARCHAR(255) NOT NULL,
    credential_reference VARCHAR(255) NOT NULL,
    token_expires_at TIMESTAMPTZ,
    -- A connection is always created active; `needs_reauth` is only ever reached by an update.
    status google_connection_status NOT NULL DEFAULT 'active',
    -- Separate from `status`, which describes credential health (active/needs_reauth/revoked).
    -- This records owner *intent*: they disconnected on purpose. Overloading `status` would make
    -- "revoked by Google" and "disconnected by the owner" indistinguishable, and only the latter
    -- should stop us prompting them to re-authorize.
    disconnected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_provider_connections_tenant_id ON review_provider_connections(tenant_id);
CREATE INDEX idx_review_provider_connections_connected_by_user_id ON review_provider_connections(connected_by_user_id);
CREATE UNIQUE INDEX idx_review_provider_connections_tenant_provider_account ON review_provider_connections(tenant_id, provider, provider_account_id);

-- ───────────────────────────────────────────────────────────────────────
-- notification_recipients — depends on: tenants, users
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_recipients (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- `notification_type` has exactly one value today.
    notification_type notification_type NOT NULL DEFAULT 'escalation',
    -- A genuine preference (email | teams | both), defaulted to the channel every tenant has.
    channel notification_channel_pref NOT NULL DEFAULT 'email',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_recipients_tenant_id ON notification_recipients(tenant_id);
CREATE INDEX idx_notification_recipients_user_id ON notification_recipients(user_id);

-- ───────────────────────────────────────────────────────────────────────
-- locations — depends on: tenants, review_provider_connections
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_connection_id UUID NOT NULL REFERENCES review_provider_connections(id) ON DELETE CASCADE,
    -- Same single-valued enum. Still written explicitly by upsertLocation, which copies it off
    -- the connection row — the default makes the column optional, not the denormalization safe.
    provider review_provider NOT NULL DEFAULT 'google',
    external_location_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    -- A confirmed location starts active; `inactive` is only ever reached by disconnect.
    status location_status NOT NULL DEFAULT 'active',
    last_synced_at TIMESTAMPTZ,
    last_sync_status sync_health_status,
    last_sync_error TEXT,
    onboarding_backfill_completed_at TIMESTAMPTZ,
    -- The poller's high-water mark: the max `reviews.external_updated_at` seen for this location
    -- across every successful import (backfill or scheduled poll). Google's reviews.list has no
    -- server-side date filter and always orders `updateTime desc`, so this is what lets a poll
    -- stop paging as soon as it reaches an already-seen review instead of re-walking full history
    -- every 15 minutes. Seeded by backfill's own completion, not left NULL for the first poll.
    last_review_synced_at TIMESTAMPTZ,
    -- Distinct from `status = 'inactive'`, which means the owner disconnected the OAuth connection
    -- (see `deactivateLocationsForConnection`). This is a still-live, still-owned connection that a
    -- billing plan's `max_locations` cap has excluded from active use — set when a tenant downgrades
    -- with more locations than their new plan allows (see `billing_plans.sql`'s own module doc),
    -- cleared on upgrade or on choosing a different location to keep active. Kept separate from
    -- `status` specifically so resuming it is a plain `UPDATE ... SET billing_paused_at = NULL`, not
    -- a re-run of the OAuth confirm flow.
    billing_paused_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locations_tenant_id ON locations(tenant_id);
CREATE INDEX idx_locations_provider_connection_id ON locations(provider_connection_id);
CREATE UNIQUE INDEX idx_locations_provider_connection_external_location ON locations(provider_connection_id, external_location_id);
CREATE INDEX idx_locations_billing_paused_at ON locations(billing_paused_at) WHERE billing_paused_at IS NOT NULL;

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

-- ───────────────────────────────────────────────────────────────────────
-- tenants.active_location_id — depends on: tenants (0002_tenant_auth.sql), locations
-- A tenant can now confirm more than one location (multi-select at OAuth confirm time), so the
-- app needs to know which ONE is currently shown on the Dashboard/Review Queue. Deliberately a
-- single shared value on `tenants`, not per-user: every member of a tenant sees the same
-- currently-selected business, and only an owner may change it (enforced at the API layer via
-- @Roles(OWNER), same as confirming a location in the first place — this is not a database
-- constraint). `ON DELETE SET NULL` rather than a NOT NULL column: removing/deactivating the
-- currently-selected location must not fail the delete, and a NULL here reads correctly as "no
-- selection yet" (falls back to the tenant's first active location — see
-- ConnectionsService.getConnectionStatus's own existing fallback for the same case). Added here,
-- after `locations`, rather than in 0002_tenant_auth.sql, purely so this column's FK target
-- already exists within the same migration file.
-- ───────────────────────────────────────────────────────────────────────

ALTER TABLE tenants ADD COLUMN active_location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
