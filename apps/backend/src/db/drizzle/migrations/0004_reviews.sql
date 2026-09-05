-- Migration: reviews
-- Google Business Profile Review Management — review ingestion & response pipeline module
-- Source of truth: apps/backend/docs/PLAN.md + apps/backend/docs/schema.dbml
-- Depends on: 0000_foundation.sql (enum types, log_db_changes()), 0002_tenant_auth.sql
--   (tenants, users), 0003_review_provider_locations.sql (locations)

-- ───────────────────────────────────────────────────────────────────────
-- reviews — depends on: tenants, locations
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    external_review_id VARCHAR(255) NOT NULL,
    external_reviewer_id VARCHAR(255),
    rating INTEGER NOT NULL,
    review_text TEXT,
    reviewer_name VARCHAR(255),
    reviewed_at TIMESTAMPTZ,
    external_updated_at TIMESTAMPTZ,
    sentiment review_sentiment,
    classification review_classification NOT NULL DEFAULT 'pending_classification',
    escalation_reason escalation_reason,
    matched_keywords JSONB,
    status review_status NOT NULL DEFAULT 'new',
    anonymized_at TIMESTAMPTZ,
    removed_upstream_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX idx_reviews_tenant_id ON reviews(tenant_id);
CREATE INDEX idx_reviews_location_id ON reviews(location_id);
CREATE UNIQUE INDEX idx_reviews_location_id_external_review_id ON reviews(location_id, external_review_id);
CREATE INDEX idx_reviews_status ON reviews(status);
CREATE INDEX idx_reviews_classification ON reviews(classification);
CREATE INDEX idx_reviews_reviewed_at ON reviews(reviewed_at);
CREATE INDEX idx_reviews_external_reviewer_id ON reviews(external_reviewer_id);

CREATE TRIGGER reviews_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON reviews
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();

-- ───────────────────────────────────────────────────────────────────────
-- sync_runs — depends on: tenants, locations
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_runs (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    "trigger" sync_trigger NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status sync_run_status NOT NULL,
    reviews_fetched INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_runs_tenant_id ON sync_runs(tenant_id);
CREATE INDEX idx_sync_runs_location_id ON sync_runs(location_id);

-- Prevents overlapping poller runs for the same location (PLAN.md §8.1). Pair with an
-- application-level staleness check so a crashed run stuck at 'running' doesn't
-- permanently block the location.
CREATE UNIQUE INDEX idx_sync_runs_location_id_running ON sync_runs(location_id) WHERE status = 'running';

CREATE TRIGGER sync_runs_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON sync_runs
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();

-- ───────────────────────────────────────────────────────────────────────
-- review_responses — depends on: tenants, reviews, users
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS review_responses (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    generation_group_id UUID,
    response_type response_type NOT NULL,
    content TEXT NOT NULL,
    source response_source NOT NULL,
    status response_status NOT NULL DEFAULT 'draft',
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    posted_at TIMESTAMPTZ,
    error_message TEXT,
    generation_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_responses_tenant_id ON review_responses(tenant_id);
CREATE INDEX idx_review_responses_review_id ON review_responses(review_id);
CREATE INDEX idx_review_responses_generation_group_id ON review_responses(generation_group_id);
CREATE INDEX idx_review_responses_status ON review_responses(status);
CREATE INDEX idx_review_responses_created_by_user_id ON review_responses(created_by_user_id);
CREATE INDEX idx_review_responses_approved_by_user_id ON review_responses(approved_by_user_id);

-- Google (and any provider) only ever has one live reply per review — posting overwrites,
-- it doesn't version. Covering 'approved' as well as 'posted' closes the sibling-snippet
-- race (PLAN.md §8.5): the second of two near-simultaneous approvals fails here before it
-- ever calls the provider's API.
CREATE UNIQUE INDEX idx_review_responses_review_id_live_reply
    ON review_responses(review_id)
    WHERE status IN ('approved', 'posted');

-- Makes the historical backfill job (PLAN.md §7) idempotent/safely re-runnable.
CREATE UNIQUE INDEX idx_review_responses_review_id_imported
    ON review_responses(review_id)
    WHERE source = 'imported';

CREATE TRIGGER review_responses_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON review_responses
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();
