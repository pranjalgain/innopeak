-- Migration: foundation
-- Google Business Profile Review Management — shared enum types
-- Source of truth: apps/backend/docs/PLAN.md + apps/backend/docs/schema.dbml
-- Target: PostgreSQL 18 (uses native uuidv7() for all domain-table primary keys)
--
-- ⚠ RECREATE YOUR DATABASE AFTER PULLING A CHANGE TO THIS FILE.
-- Per the repo convention this file is edited in place rather than followed by an ALTER
-- migration, and drizzle's migrator walks meta/_journal.json by timestamp and never re-reads a
-- file it has already applied. On an existing database `pnpm db:migrate` therefore reports
-- success and changes nothing — silently. The `set_password` member added to `token_purpose`
-- below is written by POST /v1/auth/set-password/request-otp, so a stale database does not fail
-- at migrate time; it fails at runtime with
-- `invalid input value for enum token_purpose: "set_password"` the first time a Google-only
-- account tries to add a password. Run `pnpm backend:down && pnpm backend:up && pnpm db:migrate`.
--
-- First of six migrations that together make up the full InnoPeak schema (applied in this
-- numeric order — each later file only references tables/enums already created by an
-- earlier one, no forward references, no ALTER TABLE anywhere in this set):
--   0000_foundation.sql                — this file: shared enum types
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
--
-- This file used to also carry a generic, trigger-populated `audit_logs` table
-- (`log_db_changes()`, an `AFTER INSERT OR UPDATE OR DELETE` trigger on every domain table) plus
-- an `audit_operation_type` enum for it. Removed: it had no reader anywhere in the product, it
-- had no retention or purge of its own, and its full-row JSONB snapshots made every domain-table
-- write leave a second, unmanaged copy of that row's data (PII included) sitting in the database
-- indefinitely. `0010_admin_overview.sql`'s `platform_activity_log` — a small, typed, purpose-
-- built table written only where a platform admin action actually needs to be shown on the
-- Overview page — already covers the one thing that table was read for. Removing this also
-- deletes the `purgeExpiredReviewerPii` job's second redaction pass against
-- `audit_logs`/`old_value`/`new_value` (see `ReviewSyncRepository`) — with no snapshot table
-- left to leak into, there's nothing for that pass to clean up after.

-- ═══════════════════════════════════════════════════════════════════════
-- Enum types
-- ═══════════════════════════════════════════════════════════════════════
-- All declared up front, before any table — no table below ever forward-references a type
-- that doesn't exist yet.

CREATE TYPE tenant_status AS ENUM ('pending_activation', 'active', 'suspended');
CREATE TYPE tenant_identity_provider AS ENUM ('entra_id', 'google_workspace');
CREATE TYPE user_identity_provider AS ENUM ('entra_id', 'google');
CREATE TYPE user_role AS ENUM ('owner', 'member');
CREATE TYPE user_status AS ENUM ('pending_verification', 'invited', 'active', 'disabled');
-- `set_password` is deliberately distinct from `reset`: `reset` is reserved for the (unbuilt)
-- public forgot-password flow, and sharing one value would let a code minted by the
-- authenticated set-password flow be redeemed by that public route — and make the
-- one-row-per-(user, purpose) upsert silently clobber whichever token was issued first.
CREATE TYPE token_purpose AS ENUM ('verify_email', 'invite', 'reset', 'set_password');
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
-- 'imported_reply' covers the owner's own historical replies pulled in by the onboarding
-- backfill (PLAN.md §7). Those rows are neither an AI suggestion nor an escalation snippet,
-- and review_responses.response_type is NOT NULL, so the documented backfill insert has no
-- legal value without it.
CREATE TYPE response_type AS ENUM ('auto_reply_suggestion', 'escalation_snippet', 'imported_reply');
CREATE TYPE response_source AS ENUM ('ai_generated', 'human_edited', 'human_manual', 'imported');
CREATE TYPE response_status AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'posted', 'post_failed', 'superseded');
CREATE TYPE notification_type AS ENUM ('escalation');
CREATE TYPE notification_channel_pref AS ENUM ('email', 'teams', 'both');
CREATE TYPE notification_channel AS ENUM ('email', 'teams');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE sync_trigger AS ENUM ('scheduled', 'backfill');
CREATE TYPE sync_run_status AS ENUM ('running', 'ok', 'error');
CREATE TYPE user_locale AS ENUM ('en', 'de');
