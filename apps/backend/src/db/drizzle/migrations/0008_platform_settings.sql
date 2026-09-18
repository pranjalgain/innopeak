-- Migration: platform_settings
-- Created at: 2026-09-11T09:43:54.417Z
--
-- ⚠ RECREATE YOUR DATABASE AFTER PULLING A CHANGE TO THIS FILE.
-- Per the repo convention this file is edited in place rather than followed by an ALTER
-- migration, and drizzle's migrator walks meta/_journal.json by timestamp and never re-reads a
-- file it has already applied. On an existing database `pnpm db:migrate` therefore reports
-- success and changes nothing — silently. `updated_by_platform_admin_id` (added below) is in
-- `PlatformSettingsRepository`'s SELECT list, so a stale database does not fail at migrate time;
-- it fails at runtime with `column "updated_by_platform_admin_id" does not exist` on
-- GET /v1/settings/platform-config — which is @Public() and read by the sign-in screen before any
-- session exists. The login page degrades rather than dying (the password form is unconditional),
-- but the SSO/social buttons hide behind a retry that can never succeed, and the shipped defaults
-- are sso_login_enabled = true / password_login_enabled = false — so an SSO-only tenant is locked
-- out with no explanation. The Admin Settings platform-config tab 500s outright.
--   pnpm backend:down && pnpm backend:up && pnpm db:migrate
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
    password_login_enabled BOOLEAN NOT NULL DEFAULT true,
    social_login_enabled BOOLEAN NOT NULL DEFAULT true,
    invite_members_enabled BOOLEAN NOT NULL DEFAULT true,
    -- Which platform admin last changed this row — same shape as `created_by_user_id` elsewhere
    -- (0004_reviews.sql, 0006_prompts.sql): a plain FK, SET NULL rather than CASCADE, since this
    -- is a live "current state" row, not a history log — losing track of *who* once that admin's
    -- own row is gone is an acceptable trade for not letting a deleted admin's row veto deleting
    -- them. NULL until the first update (the seeded row in this migration has no actor). Only
    -- ever an *accepted* admin's id in practice: the two paths that hard-delete a `platform_admins`
    -- row (`deleteInvitedAdmin`, `deleteExpiredInvite`) are both scoped to `status = 'invited'`,
    -- an admin who never accepted and so could never have updated this table.
    updated_by_platform_admin_id UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
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

-- Idempotent: a second run must not fail trying to insert a second id=1 row.
INSERT INTO platform_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
