-- Seed: default prompts + v1 templates for every tenant that has none yet.
-- Depends on: 0002_tenant_auth.sql (tenants), 0006_prompts.sql (prompts, prompt_versions).
-- Idempotent per (tenant_id, category). Tone defaults to professional on prompts.tone.

INSERT INTO prompts (tenant_id, category, name, description, tone)
SELECT t.id, 'positive', 'Positive review reply',
       'Used for 4-5 star reviews. Keep it warm and specific to what the reviewer praised.',
       'professional'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM prompts p WHERE p.tenant_id = t.id AND p.category = 'positive'
);

INSERT INTO prompts (tenant_id, category, name, description, tone)
SELECT t.id, 'neutral', 'Neutral review reply',
       'Used for 3-star reviews with mixed feedback.',
       'professional'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM prompts p WHERE p.tenant_id = t.id AND p.category = 'neutral'
);

INSERT INTO prompts (tenant_id, category, name, description, tone)
SELECT t.id, 'escalated', 'Negative / escalated review reply',
       'Used for 1-2 star reviews and reviews escalated to the team.',
       'professional'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM prompts p WHERE p.tenant_id = t.id AND p.category = 'escalated'
);

INSERT INTO prompt_versions (prompt_id, version, template, created_by_user_id)
SELECT p.id, 1, $t$You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.

Review: "{{review_text}}"

Write a warm, genuine thank-you reply. Mention something specific from the review if possible. Keep it under 60 words and avoid generic phrases like "we appreciate your feedback." Do not repeat the reviewer's name.$t$, NULL
FROM prompts p
WHERE p.category = 'positive'
  AND NOT EXISTS (SELECT 1 FROM prompt_versions v WHERE v.prompt_id = p.id);

INSERT INTO prompt_versions (prompt_id, version, template, created_by_user_id)
SELECT p.id, 1, $t$You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.

Review: "{{review_text}}"

Acknowledge both the positive and constructive points in the review. Invite the reviewer to give the business another visit. Keep it under 70 words. Do not repeat the reviewer's name.$t$, NULL
FROM prompts p
WHERE p.category = 'neutral'
  AND NOT EXISTS (SELECT 1 FROM prompt_versions v WHERE v.prompt_id = p.id);

INSERT INTO prompt_versions (prompt_id, version, template, created_by_user_id)
SELECT p.id, 1, $t$You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.

Review: "{{review_text}}"

Apologize sincerely without being defensive, briefly acknowledge the specific issue raised, and invite the reviewer to reach out directly to resolve it. Do not make promises about refunds or compensation. Keep it under 80 words. Do not repeat the reviewer's name.$t$, NULL
FROM prompts p
WHERE p.category = 'escalated'
  AND NOT EXISTS (SELECT 1 FROM prompt_versions v WHERE v.prompt_id = p.id);
