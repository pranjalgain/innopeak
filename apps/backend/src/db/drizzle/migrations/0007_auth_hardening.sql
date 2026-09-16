-- Migration: auth_hardening
-- Google Business Profile Review Management — auth hardening (OTP + refresh-token rotation)
-- Source of truth: apps/backend/docs/PLAN.md + apps/backend/docs/schema.dbml
-- Depends on: 0000_foundation.sql (enum types), 0002_tenant_auth.sql
--   (users, password_reset_tokens)
--
-- Follow-up to 0002_tenant_auth.sql, which is already applied everywhere and therefore must not
-- be edited in place (drizzle-orm hashes each migration file, so a changed file replays as a new
-- one). Every statement below is written idempotently so this applies cleanly both to a fresh
-- database and to a developer database that already picked up these objects from a locally
-- modified 0002.

-- ───────────────────────────────────────────────────────────────────────
-- users — one active account per email, globally
-- ───────────────────────────────────────────────────────────────────────

-- One account per email, across every tenant — the DB-level guarantee behind POST /v1/auth/signup's
-- 409. The composite idx_users_tenant_id_email in 0002 is per-tenant by design, so without this a
-- check-then-insert signup raced against itself creates several tenants for one email (observed:
-- 5 concurrent signups → 4 tenants). Partial so an anonymized account frees its email for reuse.
-- Doubles as the index behind findUserByEmail (`WHERE email = ? AND anonymized_at IS NULL`), which
-- every login/signup/resend hits and which no other index covered.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active
    ON users(email)
    WHERE anonymized_at IS NULL;

-- ───────────────────────────────────────────────────────────────────────
-- password_reset_tokens — OTP-shaped tokens, one live token per user+purpose
-- ───────────────────────────────────────────────────────────────────────

-- token_hash is deliberately NOT unique: a verify_email code is a 6-digit OTP (see auth API
-- reference's Security considerations), not a 256-bit random value, so two different users can
-- land on the same code at the same time. 0002 created this index UNIQUE, so drop and recreate it
-- non-unique. The real invariant is "at most one live token per user per purpose"
-- (idx_password_reset_tokens_user_id_purpose below) — issuing a fresh code always upserts that one
-- row rather than relying on token_hash to identify it.
DROP INDEX IF EXISTS idx_password_reset_tokens_token_hash;
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash
    ON password_reset_tokens(token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id_purpose
    ON password_reset_tokens(user_id, purpose);

-- ───────────────────────────────────────────────────────────────────────
-- refresh_tokens — depends on: users
-- ───────────────────────────────────────────────────────────────────────

-- Basic single-use rotation only (no reuse-grace-window replay tolerance, no token-family theft
-- detection) — see the auth API reference's POST /v1/auth/refresh for the accepted follow-up.
-- token_hash is unique: unlike an OTP, this is 256 bits of crypto.randomBytes, so a real
-- collision is a genuine anomaly, not an expected occurrence.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
