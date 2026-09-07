-- Migration: prompt_template_varchar
-- Created at: 2026-09-07T00:00:00.000Z
-- For databases that already applied 0006_prompts.sql when template was TEXT.
-- Greenfield installs create VARCHAR(1000) in 0006; this ALTER is idempotent on type.

ALTER TABLE prompt_versions
    ALTER COLUMN template TYPE VARCHAR(1000);
