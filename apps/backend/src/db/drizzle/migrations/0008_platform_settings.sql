CREATE TABLE IF NOT EXISTS platform_settings (
    -- Single-row table: the CHECK makes any id other than 1 impossible.
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    sso_login_enabled BOOLEAN NOT NULL DEFAULT true,
    password_login_enabled BOOLEAN NOT NULL DEFAULT true,
    social_login_enabled BOOLEAN NOT NULL DEFAULT true,
    invite_members_enabled BOOLEAN NOT NULL DEFAULT true,
    -- The last platform admin to change the row; NULL until the first update.
    updated_by_platform_admin_id UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- A tenant with no way to sign in is an outage, so this is enforced here as well as in the
    -- service.
    CONSTRAINT platform_settings_at_least_one_method_check CHECK (
        sso_login_enabled OR password_login_enabled OR social_login_enabled
    )
);

-- Idempotent seed of the single row.
INSERT INTO platform_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
