-- Migration: dev_platform_admin
-- Created at: 2026-09-07T00:00:00.000Z
--
-- Seeds the root platform admin. This is the one identity in the schema with no other way to
-- come into existence: `idx_platform_admins_single_root` permits at most one row whose
-- `invited_by_platform_admin_id` is NULL, and every admin after it arrives by invitation from an
-- existing one — so the first has to be seeded. Nothing under `src/` writes `platform_admins`.
--
-- This deliberately does NOT seed a tenant, a tenant owner, `tenant_settings`, or prompts.
-- An earlier version did, which was a mistake on two counts: a tenant owner already has a working
-- creation path (`POST /v1/auth/signup` then `POST /v1/auth/verify-email` with
-- DEV_VERIFY_EMAIL_TOKEN), and seeding one forced this file to carry its own copy of the three
-- default prompt templates — because a seeded owner is `active` from birth and so never passes
-- through the email-verification transaction that provisions them from
-- `src/api/prompts/constants/default-prompts.constant.ts`. A platform admin has no tenant, so it
-- needs no prompts and the constant stays the single source of truth.
--
-- To get a working dev tenant, create one through the API after migrating:
--
--   curl -sX POST localhost:3000/v1/auth/signup -H 'Content-Type: application/json' \
--     -d '{"businessName":"Dev Tenant","ownerName":"Dev Owner",
--          "email":"owner@example.com","password":"Owner@123456"}'
--   curl -sX POST localhost:3000/v1/auth/verify-email -H 'Content-Type: application/json' \
--     -d '{"email":"owner@example.com","otp":"000000"}'
--
-- (the fixed OTP comes from DEV_VERIFY_EMAIL_TOKEN, which is refused in production)
--
-- !! WARNING - THIS IS A JOURNALED MIGRATION !!
-- `pnpm db:migrate` applies it in EVERY environment. Plain SQL cannot read an env var, so the
-- credential below is fixed and committed to git:
--
--     admin@innopeak.com / Admin@123456   (root platform admin, status: active)
--
-- The email matches the frontend's `SUPER_ADMIN_EMAIL`, which is what routes a login to the admin
-- area. Note that nothing issues a `platform_admin` JWT yet — `JwtStrategy` validates one but
-- neither `TokenService` nor `AuthService` mints one — so this row is not yet loggable-into. It
-- exists so the root admin is in place when that module lands.
--
-- Before this reaches any public environment, either delete the row there, or make the insert
-- opt-in per database:
--
--     ALTER DATABASE <dev_db> SET innopeak.seed_dev_admin = 'true';
--
-- and add `AND current_setting('innopeak.seed_dev_admin', true) = 'true'` to the guard below.
--
-- Idempotent, and it has to be: the single-root unique index would reject a second NULL-inviter
-- row outright rather than ignoring it.

INSERT INTO platform_admins (email, password_hash, invited_by_platform_admin_id, status)
SELECT 'admin@innopeak.com',
       '$2b$10$qP9IH2DMGBVjIHW.DiNyr.Ki1H1BmXQbbnIgbBZtto/P7hyCMGaB2',
       NULL,
       'active'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_admins WHERE invited_by_platform_admin_id IS NULL
);
