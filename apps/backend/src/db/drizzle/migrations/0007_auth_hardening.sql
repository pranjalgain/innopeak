-- One active account per email across all tenants (backs signup's 409); partial so an anonymized
-- account frees its email. Also serves findUserByEmail.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active
    ON users(email)
    WHERE anonymized_at IS NULL;

-- token_hash is not unique: a 6-digit OTP can collide between users. The real invariant is one live
-- token per (user, purpose).
DROP INDEX IF EXISTS idx_user_auth_tokens_token_hash;
CREATE INDEX IF NOT EXISTS idx_user_auth_tokens_token_hash
    ON user_auth_tokens(token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_auth_tokens_user_id_purpose
    ON user_auth_tokens(user_id, purpose);

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
