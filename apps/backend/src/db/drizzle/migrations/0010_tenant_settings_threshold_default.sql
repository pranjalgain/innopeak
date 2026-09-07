-- Migration: tenant_settings_threshold_default
-- Created at: 2026-09-07T00:00:00.000Z
--
-- Gives `tenant_settings.escalation_rating_threshold` the database default it should have had
-- from the start, matching its sibling `auto_post_enabled BOOLEAN NOT NULL DEFAULT false`.
--
-- It was `INTEGER NOT NULL` with no default, so every writer had to restate the number: signup
-- (AuthRepository.insertTenantSettings) and the dev-admin migration (0009) each carried their own
-- literal 3, with nothing in Postgres or TypeScript keeping them in step. Changing the product
-- default in one place would have left local testing on the old threshold — while exercising the
-- exact rule the threshold decides (rating < threshold escalates; >= is an auto-reply candidate).
--
-- Greenfield installs get this from the edited 0002_tenant_auth.sql; this ALTER is for databases
-- that already applied 0002. Same split as 0006_prompts.sql / 0008_prompt_template_varchar.sql.
--
-- Only the default changes. Existing rows keep whatever threshold their tenant configured, and
-- `tenant_settings_escalation_rating_threshold_check` (BETWEEN 1 AND 5) still applies.

ALTER TABLE tenant_settings
    ALTER COLUMN escalation_rating_threshold SET DEFAULT 3;
