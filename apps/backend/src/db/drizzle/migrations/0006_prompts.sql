-- Migration: prompts
-- Google Business Profile Review Management — AI reply prompt management module
-- Source of truth: apps/backend/docs/PLAN.md + apps/backend/docs/schema.dbml
-- Depends on: 0000_foundation.sql (log_db_changes()), 0002_tenant_auth.sql (tenants, users),
--   0004_reviews.sql (review_responses)
--
-- Backs the tenant-owned, versioned, tone-tunable reply prompts each owner edits — distinct
-- from review_responses.generation_metadata (jsonb), which only ever recorded loose
-- model/prompt-version metadata per generated reply with no normalized table behind it.
-- Enums are declared locally to this file rather than in 0000_foundation.sql: that file's
-- migrations are already applied, and CREATE TYPE for a new module added later is ordinary
-- schema evolution, not a forward-reference within the original six-file set.

-- ═══════════════════════════════════════════════════════════════════════
-- Enum types
-- ═══════════════════════════════════════════════════════════════════════

CREATE TYPE prompt_category AS ENUM ('positive', 'neutral', 'escalated');
CREATE TYPE prompt_tone AS ENUM ('friendly', 'professional', 'formal', 'playful', 'empathetic');

-- ───────────────────────────────────────────────────────────────────────
-- prompts — depends on: tenants
-- ───────────────────────────────────────────────────────────────────────
-- One row per tenant per reply category. category drives which prompt the generation
-- pipeline selects for a given review; name/description are the owner-facing label shown in
-- Settings → Prompts. tone is a live setting, not history — updated in place, independent of
-- the template text (which lives on prompt_versions and is append-only). There is exactly one
-- owner per tenant today, so "the tenant's tone for this prompt" has nothing to be scoped
-- narrower than; a genuine per-member tone preference would need its own table keyed by
-- (prompt_id, user_id), not a retrofit of this column.

CREATE TABLE IF NOT EXISTS prompts (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category prompt_category NOT NULL,
    name VARCHAR(255) NOT NULL,
    description VARCHAR(500),
    tone prompt_tone NOT NULL DEFAULT 'professional',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_prompts_tenant_id_category ON prompts(tenant_id, category);

CREATE TRIGGER prompts_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON prompts
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();

-- ───────────────────────────────────────────────────────────────────────
-- prompt_versions — depends on: prompts, users
-- ───────────────────────────────────────────────────────────────────────
-- Append-only: every edit inserts a new row, never updates an existing one — an owner's prior
-- wording stays auditable/comparable against approval-rate stats. No "current version"
-- flag/pointer column on either this table or prompts: the current version is
-- MAX(version) WHERE prompt_id = ?, which the unique index below already makes a cheap
-- index-only lookup. That also sidesteps a circular FK back to prompts, and matches this
-- schema's existing preference for deriving state from an immutable log (see review_responses'
-- status transitions) over maintaining a redundant pointer that a version-insert could forget
-- to update.

CREATE TABLE IF NOT EXISTS prompt_versions (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    template TEXT NOT NULL,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT prompt_versions_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX idx_prompt_versions_prompt_id_version ON prompt_versions(prompt_id, version);

CREATE TRIGGER prompt_versions_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON prompt_versions
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();

-- ───────────────────────────────────────────────────────────────────────
-- review_responses — extend existing table (0004_reviews.sql)
-- ───────────────────────────────────────────────────────────────────────
-- Adds the three columns the prompt-performance analytics (Settings → Prompts) need:
-- which exact prompt version generated a draft, its pre-edit AI content, and when its status
-- became terminal. generation_metadata (jsonb) still holds the looser model/token-count
-- fields it always did — these are pulled out into real columns specifically because
-- analytics needs to index/join/aggregate on them cheaply, which jsonb querying isn't suited
-- for. The original six migrations avoided ALTER TABLE by design (a self-contained,
-- forward-reference-free bootstrap batch); ordinary schema evolution afterward is expected to
-- use it, as here.

ALTER TABLE review_responses
    ADD COLUMN prompt_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL;
ALTER TABLE review_responses
    ADD COLUMN original_content TEXT;
ALTER TABLE review_responses
    ADD COLUMN decided_at TIMESTAMPTZ;

-- Nullable: 'imported'/'human_manual' rows (response_source) never went through a prompt at all.
CREATE INDEX idx_review_responses_prompt_version_id ON review_responses(prompt_version_id);
