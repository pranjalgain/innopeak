-- Seed: Default dev admin (owner) user
-- Idempotent — skips if a user at :'dev_admin_email' already exists.
--
-- Email and password come from the DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD env vars (see
-- .env.example) — seed.sh reads them, hashes the password with the app's own bcrypt config,
-- and passes both in as the `dev_admin_email` / `dev_admin_password_hash` psql variables below.
-- Creates a tenant + owner user + tenant_settings together, already `active` and
-- email-verified, so local testing can skip signup + email verification entirely.
--
-- Uses \gset/\if rather than a DO $$ ... $$ block — psql's :'var' substitution doesn't reach
-- inside dollar-quoted bodies, so a PL/pgSQL block can't see these variables at all.

SELECT EXISTS (SELECT 1 FROM users WHERE email = :'dev_admin_email') AS already_exists \gset

\if :already_exists
\echo 'Dev admin user already exists, skipping'
\else

INSERT INTO tenants (name, status)
VALUES ('Dev Tenant', 'active')
RETURNING id AS tenant_id \gset

INSERT INTO users (tenant_id, name, email, password_hash, role, status, email_verified_at)
VALUES (
  :'tenant_id',
  'Dev Admin',
  :'dev_admin_email',
  :'dev_admin_password_hash',
  'owner',
  'active',
  NOW()
)
RETURNING id AS user_id \gset

INSERT INTO tenant_settings (tenant_id, escalation_rating_threshold, auto_post_enabled)
VALUES (:'tenant_id', 3, false);

\echo 'Dev admin user created'
\echo :tenant_id
\echo :user_id

\endif
