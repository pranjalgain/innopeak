-- Brings an EXISTING database (one that applied migrations 0003 and 0009 before they were edited in place) in line with them.
--
-- Why this exists: until the first release, a schema change is edited into the module's original migration, but drizzle never re-reads an
-- applied file, so `pnpm db:migrate` is a silent no-op on a database that already ran it. A database created from scratch needs none of
-- this. Safe to run more than once.
--
--   psql "$DATABASE_URL" -f apps/backend/docs/upgrades/2026-10-activity-log-and-business-card.sql
--
-- Run it WITHOUT `-1`/`--single-transaction`: on PostgreSQL before 12 a new enum value cannot be added inside a transaction block, and
-- the backfill at the end uses the new value, so it has to come after the ALTER TYPE statements have committed.

-- 0003_review_provider_locations: the business card's category and Google's own rating.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS category VARCHAR(255);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS google_rating NUMERIC(3,2);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS google_review_count INTEGER;
-- Re-read once on the next poll, so the category fills in without waiting a day.
UPDATE locations SET details_refreshed_at = NULL WHERE category IS NULL;

-- 0009_admin_overview: the two new activity types, the details column and the CHECK that pins each type's columns.
ALTER TYPE platform_activity_type ADD VALUE IF NOT EXISTS 'business_joined';
ALTER TYPE platform_activity_type ADD VALUE IF NOT EXISTS 'platform_settings_changed';
ALTER TABLE platform_activity_log ADD COLUMN IF NOT EXISTS details JSONB;

ALTER TABLE platform_activity_log DROP CONSTRAINT IF EXISTS platform_activity_log_target_check;
ALTER TABLE platform_activity_log ADD CONSTRAINT platform_activity_log_target_check CHECK (
    (type IN ('business_suspended', 'business_reactivated', 'business_erasure_requested', 'business_erasure_cancelled', 'business_erased', 'business_joined') AND business_name IS NOT NULL AND target_email IS NULL) OR
    (type IN ('admin_invite_sent', 'admin_invite_revoked', 'admin_disabled', 'admin_enabled') AND target_email IS NOT NULL AND business_name IS NULL AND tenant_id IS NULL) OR
    (type IN ('user_activated', 'user_deactivated') AND target_email IS NOT NULL AND business_name IS NOT NULL) OR
    (type = 'platform_settings_changed' AND details IS NOT NULL AND business_name IS NULL AND target_email IS NULL AND tenant_id IS NULL)
);

-- The Overview feed used to synthesise "a business joined" from `tenants.created_at`; it now reads only real rows, so give every
-- business that existed before the change its entry (once: a business that already has one is skipped). Businesses still waiting on
-- their email code, and erased ones (their name is gone), never joined and are left out. The actor is the owner, as for a live signup.
INSERT INTO platform_activity_log (type, actor_email, tenant_id, business_name, occurred_at)
SELECT 'business_joined', owner.email, tenant.id, tenant.name, tenant.created_at
FROM tenants tenant
CROSS JOIN LATERAL (
    SELECT member.email
    FROM users member
    WHERE member.tenant_id = tenant.id AND member.role = 'owner' AND member.email IS NOT NULL
    ORDER BY member.created_at
    LIMIT 1
) owner
WHERE tenant.status IN ('active', 'suspended')
  AND NOT EXISTS (
      SELECT 1 FROM platform_activity_log existing
      WHERE existing.type = 'business_joined' AND existing.tenant_id = tenant.id
  );
