CREATE TYPE prompt_category AS ENUM ('positive', 'neutral', 'escalated');
CREATE TYPE prompt_tone AS ENUM ('friendly', 'professional', 'formal', 'playful', 'empathetic');

-- One prompt per tenant per reply category; tone is a live setting, the template text lives on
-- prompt_versions.
CREATE TABLE IF NOT EXISTS prompts (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category prompt_category NOT NULL,
    name VARCHAR(255) NOT NULL,
    description VARCHAR(500),
    tone prompt_tone NOT NULL DEFAULT 'professional',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_prompts_tenant_id_category ON prompts(tenant_id, category);

-- Append-only: each edit inserts a new row; the current version is MAX(version) per prompt.
CREATE TABLE IF NOT EXISTS prompt_versions (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    template VARCHAR(1000) NOT NULL,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT prompt_versions_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX idx_prompt_versions_prompt_id_version ON prompt_versions(prompt_id, version);

ALTER TABLE review_responses
    ADD COLUMN prompt_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL;
ALTER TABLE review_responses
    ADD COLUMN original_content TEXT;
ALTER TABLE review_responses
    ADD COLUMN decided_at TIMESTAMPTZ;

-- Nullable: imported and manually written replies never went through a prompt.
CREATE INDEX idx_review_responses_prompt_version_id ON review_responses(prompt_version_id);
