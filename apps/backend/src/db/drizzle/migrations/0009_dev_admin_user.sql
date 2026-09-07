-- Migration: dev_admin_user
-- Created at: 2026-09-07T00:00:00.000Z
--
-- Bootstraps a ready-to-use tenant + owner so local work can skip signup and OTP entirely.
-- Replaces the deleted src/db/seeds/ files (002_admin_user.sql + 003_dev_prompts.sql), which
-- needed a psql client and a shell runner to apply.
--
-- !! WARNING - THIS IS A JOURNALED MIGRATION !!
-- `pnpm db:migrate` applies it in EVERY environment, staging and production included. Plain SQL
-- cannot read DEV_ADMIN_PASSWORD, so the credential is fixed and committed to git:
--
--     admin@example.com / Admin@123456   (role: owner, status: active)
--
-- Before this reaches any public environment, either delete that row there, or make the inserts
-- opt-in per database:
--
--     ALTER DATABASE <dev_db> SET innopeak.seed_dev_admin = 'true';
--
-- and add `AND current_setting('innopeak.seed_dev_admin', true) = 'true'` to each guard below,
-- which leaves the migration inert on any database that has not explicitly opted in.
--
-- Idempotent: every statement is guarded on the row not already existing, so a replay inserts
-- nothing rather than raising a unique violation.
--
-- The account is created already active and email-verified, so it never passes through
-- POST /v1/auth/verify-email - the route that provisions default prompts
-- (AuthDbService.provisionTenantWorkspace). That is why this file also inserts the three prompts
-- and their v1 templates: without them the tenant exists but Settings -> Prompts is blank, and
-- nothing would ever backfill it. The templates are copied from
-- src/api/prompts/constants/default-prompts.constant.ts, which remains the source of truth for
-- real tenants; default-prompts.constant.spec.ts asserts the two stay identical.

-- ── tenant + owner ──────────────────────────────────────────────────────────────────────────
-- One statement, so the owner attaches to exactly the tenant this created. Keying the user off
-- `tenants.name` instead would misfire the day a real tenant signs up as "Dev Tenant".

WITH new_tenant AS (
  INSERT INTO tenants (name, status)
  SELECT 'Dev Tenant', 'active'
  WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@example.com')
  RETURNING id
)
INSERT INTO users (tenant_id, name, email, password_hash, role, status, email_verified_at)
SELECT id, 'Dev Admin', 'admin@example.com',
       '$2b$10$qP9IH2DMGBVjIHW.DiNyr.Ki1H1BmXQbbnIgbBZtto/P7hyCMGaB2',
       'owner', 'active', NOW()
FROM new_tenant;

-- ── tenant settings ─────────────────────────────────────────────────────────────────────────
-- `users.email` is unique, so u.tenant_id below resolves to exactly one tenant.

-- `escalation_rating_threshold` is omitted deliberately: it takes the column default set in
-- 0002/0010, so this file cannot drift from the product default the way it used to.
INSERT INTO tenant_settings (tenant_id, auto_post_enabled)
SELECT u.tenant_id, false
FROM users u
WHERE u.email = 'admin@example.com'
  AND NOT EXISTS (SELECT 1 FROM tenant_settings s WHERE s.tenant_id = u.tenant_id);

-- ── the three default prompts, mirroring what verifyEmail would have provisioned ─────────────

INSERT INTO prompts (tenant_id, category, name, description, tone)
SELECT u.tenant_id, 'positive', 'Positive review reply',
       'Used for 4-5 star reviews. Keep it warm and specific to what the reviewer praised.',
       'professional'
FROM users u
WHERE u.email = 'admin@example.com'
  AND NOT EXISTS (
    SELECT 1 FROM prompts p WHERE p.tenant_id = u.tenant_id AND p.category = 'positive'
  );

INSERT INTO prompt_versions (prompt_id, version, template, created_by_user_id)
SELECT p.id, 1, $t$You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.

Review: "{{review_text}}"

Write a warm, genuine thank-you reply. Mention something specific from the review if possible. Keep it under 60 words and avoid generic phrases like "we appreciate your feedback." Do not repeat the reviewer's name.$t$, NULL
FROM prompts p
JOIN users u ON u.tenant_id = p.tenant_id
WHERE u.email = 'admin@example.com'
  AND p.category = 'positive'
  AND NOT EXISTS (SELECT 1 FROM prompt_versions v WHERE v.prompt_id = p.id);

INSERT INTO prompts (tenant_id, category, name, description, tone)
SELECT u.tenant_id, 'neutral', 'Neutral review reply',
       'Used for 3-star reviews with mixed feedback.',
       'professional'
FROM users u
WHERE u.email = 'admin@example.com'
  AND NOT EXISTS (
    SELECT 1 FROM prompts p WHERE p.tenant_id = u.tenant_id AND p.category = 'neutral'
  );

INSERT INTO prompt_versions (prompt_id, version, template, created_by_user_id)
SELECT p.id, 1, $t$You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.

Review: "{{review_text}}"

Acknowledge both the positive and constructive points in the review. Invite the reviewer to give the business another visit. Keep it under 70 words. Do not repeat the reviewer's name.$t$, NULL
FROM prompts p
JOIN users u ON u.tenant_id = p.tenant_id
WHERE u.email = 'admin@example.com'
  AND p.category = 'neutral'
  AND NOT EXISTS (SELECT 1 FROM prompt_versions v WHERE v.prompt_id = p.id);

INSERT INTO prompts (tenant_id, category, name, description, tone)
SELECT u.tenant_id, 'escalated', 'Negative / escalated review reply',
       'Used for 1-2 star reviews and reviews escalated to the team.',
       'professional'
FROM users u
WHERE u.email = 'admin@example.com'
  AND NOT EXISTS (
    SELECT 1 FROM prompts p WHERE p.tenant_id = u.tenant_id AND p.category = 'escalated'
  );

INSERT INTO prompt_versions (prompt_id, version, template, created_by_user_id)
SELECT p.id, 1, $t$You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.

Review: "{{review_text}}"

Apologize sincerely without being defensive, briefly acknowledge the specific issue raised, and invite the reviewer to reach out directly to resolve it. Do not make promises about refunds or compensation. Keep it under 80 words. Do not repeat the reviewer's name.$t$, NULL
FROM prompts p
JOIN users u ON u.tenant_id = p.tenant_id
WHERE u.email = 'admin@example.com'
  AND p.category = 'escalated'
  AND NOT EXISTS (SELECT 1 FROM prompt_versions v WHERE v.prompt_id = p.id);
