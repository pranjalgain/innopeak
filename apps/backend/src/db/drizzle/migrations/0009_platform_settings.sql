-- Migration: platform_settings
-- Created at: 2026-09-11T09:43:54.417Z
--
-- A single, platform-wide settings row — not scoped to a tenant, not scoped to a platform admin.
-- Replaces what used to be three `NEXT_PUBLIC_AUTH_*_ENABLED` env vars plus
-- `NEXT_PUBLIC_INVITE_MEMBERS_ENABLED`: which login methods the sign-in/sign-up screens offer,
-- and whether a tenant owner can invite teammates, now live here instead — editable at runtime
-- from the Super Admin's Admin Settings screen rather than requiring a redeploy.
--
-- `id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1)` is the standard Postgres singleton-table
-- pattern: the CHECK makes any row other than id=1 impossible to insert, so there is exactly one
-- row for the lifetime of the table. Callers always read/write id=1, never SELECT-then-branch.
CREATE TABLE IF NOT EXISTS platform_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    -- Defaults mirror the env vars' own prior defaults (NEXT_PUBLIC_AUTH_SSO_ENABLED=true,
    -- NEXT_PUBLIC_AUTH_PASSWORD_ENABLED=false, NEXT_PUBLIC_AUTH_SOCIAL_ENABLED=false,
    -- NEXT_PUBLIC_INVITE_MEMBERS_ENABLED=false) so migrating an existing environment changes
    -- nothing observable until a Super Admin actually flips one.
    sso_login_enabled BOOLEAN NOT NULL DEFAULT true,
    password_login_enabled BOOLEAN NOT NULL DEFAULT false,
    social_login_enabled BOOLEAN NOT NULL DEFAULT false,
    invite_members_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Belt-and-suspenders alongside the service-level check in AdminSettingsService — a tenant
    -- with no way to sign in at all is a real outage, not just a UX gap, so this is rejected at
    -- the schema level too rather than trusting every future write path to remember the rule.
    -- Note this is *not* what protects a platform admin from being locked out: password login for
    -- admins is unconditional in the frontend regardless of `password_login_enabled` (see
    -- `LoginView`'s own comment) — an admin has no SSO identity to fall back on at all today, so
    -- that one can never be optional the way these three tenant-facing methods can.
    CONSTRAINT platform_settings_at_least_one_method_check CHECK (
        sso_login_enabled OR password_login_enabled OR social_login_enabled
    )
);

CREATE TRIGGER platform_settings_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON platform_settings
    FOR EACH ROW EXECUTE FUNCTION log_db_changes();

-- Idempotent: a second run must not fail trying to insert a second id=1 row.
INSERT INTO platform_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
