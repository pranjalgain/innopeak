-- Migration: foundation
-- Google Business Profile Review Management — shared enum types & audit infrastructure
-- Source of truth: apps/backend/docs/PLAN.md + apps/backend/docs/schema.dbml
-- Target: PostgreSQL 18 (uses native uuidv7() for all domain-table primary keys)
--
-- First of six migrations that together make up the full InnoPeak schema (applied in this
-- numeric order — each later file only references tables/enums already created by an
-- earlier one, no forward references, no ALTER TABLE anywhere in this set):
--   0000_foundation.sql                — this file: enums, audit_logs, log_db_changes()
--   0001_platform_admin.sql            — platform_admins and its two child tables
--   0002_tenant_auth.sql               — tenants, users, and auth-adjacent tables
--   0003_review_provider_locations.sql — review provider connections, locations
--   0004_reviews.sql                   — reviews, sync_runs, review_responses
--   0005_notifications.sql             — notifications
--
-- Enums are declared here, not per-module, because two of them are genuinely shared across
-- module boundaries: user_identity_provider (platform_admin_identities in 0001 AND
-- user_identities in 0002) and notification_type (notification_recipients in 0003 AND
-- notifications in 0005). Every table in every later migration file references only enum
-- types already created here.

-- ═══════════════════════════════════════════════════════════════════════
-- Enum types
-- ═══════════════════════════════════════════════════════════════════════
-- All declared up front, before any table — no table below ever forward-references a type
-- that doesn't exist yet.

CREATE TYPE audit_operation_type AS ENUM ('INSERT', 'UPDATE', 'DELETE');
CREATE TYPE tenant_status AS ENUM ('pending_activation', 'active', 'suspended');
CREATE TYPE tenant_identity_provider AS ENUM ('entra_id', 'google_workspace');
CREATE TYPE user_identity_provider AS ENUM ('entra_id', 'google');
CREATE TYPE user_role AS ENUM ('owner', 'member');
CREATE TYPE user_status AS ENUM ('pending_verification', 'invited', 'active', 'disabled');
CREATE TYPE token_purpose AS ENUM ('verify_email', 'invite', 'reset');
CREATE TYPE platform_admin_status AS ENUM ('invited', 'active', 'disabled');
CREATE TYPE platform_admin_invite_purpose AS ENUM ('invite', 'reset');
CREATE TYPE review_provider AS ENUM ('google');
CREATE TYPE google_connection_status AS ENUM ('active', 'needs_reauth');
CREATE TYPE location_status AS ENUM ('active', 'inactive');
CREATE TYPE sync_health_status AS ENUM ('ok', 'error');
CREATE TYPE review_sentiment AS ENUM ('positive', 'neutral', 'negative');
CREATE TYPE review_classification AS ENUM ('auto_reply_candidate', 'escalated', 'pending_classification');
CREATE TYPE escalation_reason AS ENUM ('low_rating', 'blocklist_match');
CREATE TYPE review_status AS ENUM ('new', 'in_review', 'responded', 'dismissed');
CREATE TYPE response_type AS ENUM ('auto_reply_suggestion', 'escalation_snippet');
CREATE TYPE response_source AS ENUM ('ai_generated', 'human_edited', 'human_manual', 'imported');
CREATE TYPE response_status AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'posted', 'post_failed', 'superseded');
CREATE TYPE notification_type AS ENUM ('escalation');
CREATE TYPE notification_channel_pref AS ENUM ('email', 'teams', 'both');
CREATE TYPE notification_channel AS ENUM ('email', 'teams');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE sync_trigger AS ENUM ('scheduled', 'backfill');
CREATE TYPE sync_run_status AS ENUM ('running', 'ok', 'error');

-- ═══════════════════════════════════════════════════════════════════════
-- Shared audit infrastructure
-- ═══════════════════════════════════════════════════════════════════════

-- One audit log table, not two: this schema deliberately doesn't have a separate app-level
-- "audit_logs" event table alongside this one. That table (opt-in, populated only when a
-- controller method is explicitly annotated) added a parallel logging path with no
-- tenant_id/user_id column of its own, no current usage anywhere, and the same GDPR redaction
-- burden as this table for none of its automatic-coverage benefit. audit_logs already captures
-- every row-level change on every domain table unconditionally, with no code required — that
-- covers the accountability need this schema actually has. See PLAN.md §6.1.

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    event_timestamp TIMESTAMPTZ DEFAULT NOW(),
    table_name VARCHAR(100) NOT NULL,
    operation_type audit_operation_type NOT NULL,
    tenant_id UUID,
    db_user VARCHAR(100),
    db_name VARCHAR(100),
    old_value JSONB,
    new_value JSONB,
    triggered_by VARCHAR(100) DEFAULT current_user
);

-- No FK on tenant_id, deliberately: this table is defined before `tenants` even exists (see the
-- dependency ordering below), and audit history should survive a tenant being deleted for
-- forensic/compliance reasons rather than cascade-deleting with it. A FK with ON DELETE SET NULL
-- would land in the exact same end state anyway once a tenant is gone (tenant_id -> NULL) — the
-- only thing it would add is validation while the tenant is still alive, which is already covered
-- in practice since this column is never hand-entered: log_db_changes() populates it generically
-- by pulling `tenant_id` out of whichever row the trigger fired on, a value that's already
-- FK-validated on that row itself. Simply NULL for the handful of platform-level tables that have
-- no tenant_id of their own (tenants itself, platform_admins and its two child tables, and this
-- table) — not a gap, those rows genuinely aren't scoped to one tenant.
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);

-- GDPR note (see PLAN.md §6.1 "The gap this design doesn't cover on its own: the audit trail"):
-- log_db_changes() below captures a full row snapshot on every domain-table write, including the
-- exact UPDATE that anonymizes a `reviews` row — so the pre-anonymization reviewer_name survives
-- here even after it's cleared from the live table. The retention/erasure job must also redact
-- every audit_logs row referencing that review's id (not just the latest one — every intermediate
-- snapshot before anonymization captured the name too), matched by table_name and the row's id
-- inside old_value/new_value. These indexes exist to make that lookup a targeted scan instead of
-- a full-table scan; they are not used by the regular application write path.
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_old_value_gin ON audit_logs USING GIN (old_value);
CREATE INDEX IF NOT EXISTS idx_audit_logs_new_value_gin ON audit_logs USING GIN (new_value);

-- Function to log DB changes
CREATE OR REPLACE FUNCTION log_db_changes()
RETURNS TRIGGER AS $$
DECLARE
    trigger_source TEXT;
    new_row JSONB;
    old_row JSONB;
    row_tenant_id UUID;
BEGIN
    IF TG_WHEN = 'AFTER' THEN
        trigger_source := TG_NAME;
    ELSE
        trigger_source := current_user;
    END IF;

    -- TG_OP is plain `text`; Postgres has no implicit text→enum cast, so it must be cast
    -- explicitly wherever it's inserted into the enum-typed `operation_type` column below.
    --
    -- tenant_id is pulled generically out of whichever row the operation provides, via the JSONB
    -- key rather than a real column reference — this one function serves every table, most of
    -- which have a tenant_id column and a few of which (tenants itself, platform_admins and its
    -- two child tables) don't. Where it's absent, ->>'tenant_id' simply yields NULL, which is the
    -- correct value for a platform-level row that isn't scoped to one tenant.
    IF (TG_OP = 'INSERT') THEN
        new_row := to_jsonb(NEW);
        row_tenant_id := (new_row->>'tenant_id')::UUID;
        INSERT INTO audit_logs(table_name, operation_type, tenant_id, new_value, triggered_by, db_user, db_name)
        VALUES (TG_TABLE_NAME, TG_OP::audit_operation_type, row_tenant_id, new_row, trigger_source, session_user, current_database());
    ELSIF (TG_OP = 'UPDATE') THEN
        new_row := to_jsonb(NEW);
        old_row := to_jsonb(OLD);
        row_tenant_id := (new_row->>'tenant_id')::UUID;
        INSERT INTO audit_logs(table_name, operation_type, tenant_id, old_value, new_value, triggered_by, db_user, db_name)
        VALUES (TG_TABLE_NAME, TG_OP::audit_operation_type, row_tenant_id, old_row, new_row, trigger_source, session_user, current_database());
    ELSIF (TG_OP = 'DELETE') THEN
        old_row := to_jsonb(OLD);
        row_tenant_id := (old_row->>'tenant_id')::UUID;
        INSERT INTO audit_logs(table_name, operation_type, tenant_id, old_value, triggered_by, db_user, db_name)
        VALUES (TG_TABLE_NAME, TG_OP::audit_operation_type, row_tenant_id, old_row, trigger_source, session_user, current_database());
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
