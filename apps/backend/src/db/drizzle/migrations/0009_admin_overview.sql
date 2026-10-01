-- Migration: admin_overview
-- Created at: 2026-09-11T10:41:17.519Z
--
-- Backs the Super Admin Overview page's "Activity" panel — a small, purpose-built log of
-- platform-admin actions (business suspend/reactivate, admin invite send/revoke). Written
-- explicitly, once, by the same service call that performs the action, with the real actor
-- already in hand — not inferred from a generic trigger, which is why `actor_email` etc. are
-- plain columns here rather than something recovered after the fact from another log.
CREATE TYPE platform_activity_type AS ENUM (
    'business_suspended',
    'business_reactivated',
    'admin_invite_sent',
    'admin_invite_revoked',
    -- Enabling/disabling a tenant user is the most consequential per-person action a platform
    -- admin can take — it is what locks a real customer out of their account — and it was the one
    -- action missing from this log entirely, so the Overview's "Recent platform admin actions"
    -- panel silently under-reported exactly the events someone would go looking for.
    'user_activated',
    'user_deactivated',
    -- Disabling/re-enabling a fellow platform admin — a rare but high-trust action. Same column
    -- shape as the invite events (renders from `target_email`), so it joins their CHECK arm below.
    'admin_disabled',
    'admin_enabled',
    -- GDPR tenant erasure (AdminBusinessesService.requestErasure/cancelErasure, and the nightly
    -- purge job for the terminal 'business_erased' entry once every user is actually anonymized).
    -- Same column shape as business_suspended/business_reactivated — renders from business_name.
    'business_erasure_requested',
    'business_erasure_cancelled',
    'business_erased'
);

CREATE TABLE IF NOT EXISTS platform_activity_log (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    type platform_activity_type NOT NULL,
    -- Nullable + SET NULL, not CASCADE: this is a log of who did what, so removing an admin must
    -- not take the record of their actions with them — which is exactly when that record matters
    -- most. Same reasoning as `business_name`/`target_email` below, and the same treatment: the id
    -- is a convenience pointer at the live row, `actor_email` is what the entry actually renders.
    actor_platform_admin_id UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
    actor_email VARCHAR(255) NOT NULL,
    -- Set for business_* entries, NULL for admin_invite_* ones. A convenience pointer for linking
    -- an entry back to a live business; deliberately NOT what the entry's text is rendered from,
    -- and deliberately absent from the CHECK below. A tenant can be hard-deleted, which sets this
    -- to NULL — an earlier version made the CHECK require `tenant_id IS NOT NULL` for business_*
    -- rows, which meant that SET NULL could never actually happen: Postgres runs it as an UPDATE,
    -- the UPDATE tripped the CHECK, and the tenant DELETE failed outright, leaving any business
    -- that had ever been suspended permanently undeletable.
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    -- What business_* entries actually render. Snapshotted at write time rather than joined from
    -- `tenants` for the same reason `target_email` below is a plain value and not a FK: the row it
    -- names can be deleted, and the log still has to say which one it was. It also keeps history
    -- honest — renaming a business must not retroactively rewrite what past entries say happened.
    business_name VARCHAR(255),
    -- Set for admin_invite_* entries, NULL for business_* ones. Stored as a plain value rather
    -- than a `platform_admins` FK: an invite can be revoked (its row deleted outright, see
    -- `PlatformAdminRepository.deleteInvitedAdmin`), and the log entry for revoking it must still
    -- name which email that was.
    target_email VARCHAR(255),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Constrains only the columns an entry *renders from*, never `tenant_id` — see its comment.
    -- One arm per event family, and each arm pins every render column to NOT NULL or NULL so a
    -- new type cannot be added later without deciding what it actually displays.
    CONSTRAINT platform_activity_log_target_check CHECK (
        (type IN ('business_suspended', 'business_reactivated', 'business_erasure_requested', 'business_erasure_cancelled', 'business_erased') AND business_name IS NOT NULL AND target_email IS NULL) OR
        (type IN ('admin_invite_sent', 'admin_invite_revoked', 'admin_disabled', 'admin_enabled') AND target_email IS NOT NULL AND business_name IS NULL AND tenant_id IS NULL) OR
        -- A user event needs both: which person, and which business they belong to. "Deactivated
        -- jane@example.com" is ambiguous across tenants on a platform-wide feed.
        (type IN ('user_activated', 'user_deactivated') AND target_email IS NOT NULL AND business_name IS NOT NULL)
    )
);

CREATE INDEX idx_platform_activity_log_occurred_at ON platform_activity_log(occurred_at DESC);
CREATE INDEX idx_platform_activity_log_actor_platform_admin_id ON platform_activity_log(actor_platform_admin_id);
CREATE INDEX idx_platform_activity_log_tenant_id ON platform_activity_log(tenant_id);
