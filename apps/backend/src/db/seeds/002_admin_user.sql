-- Seed: Default admin user
-- Idempotent — skips if admin@example.com already exists
--
-- Default credentials:
--   Email:    admin@example.com
--   Password: Admin@123456
--
-- The password hash below is bcrypt($2b$10$) for "Admin@123456".
-- Regenerate with: node -e "require('bcrypt').hash('Admin@123456',10).then(console.log)"

DO $$
DECLARE
  v_admin_id UUID;
  v_role_id UUID;
  v_hash TEXT := '$2b$10$SM7uJF386MetwydyxEfBjeKmyf9A4KHgb2gMkRXB7llN7EaaDgkKe';
BEGIN
  -- Skip if user already exists
  IF EXISTS (SELECT 1 FROM users WHERE email = 'admin@example.com') THEN
    RAISE NOTICE 'Admin user already exists, skipping';
    RETURN;
  END IF;

  -- Insert admin user
  INSERT INTO users (email, password_hash, first_name, last_name, is_active, is_email_verified)
  VALUES ('admin@example.com', v_hash, 'Admin', 'User', true, true)
  RETURNING id INTO v_admin_id;

  -- Assign admin role
  SELECT id INTO v_role_id FROM roles WHERE name = 'admin';

  IF v_role_id IS NOT NULL THEN
    INSERT INTO user_roles (user_id, role_id)
    VALUES (v_admin_id, v_role_id)
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Admin user created and assigned admin role';
  ELSE
    RAISE WARNING 'Admin role not found. Run 001_roles_permissions.sql first.';
  END IF;
END $$;
