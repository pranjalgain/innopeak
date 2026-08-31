-- Seed: Roles & Permissions
-- Idempotent — safe to re-run

-- Roles
INSERT INTO roles (name, description) VALUES
    ('admin', 'Full system administrator with all permissions'),
    ('user', 'Standard user with basic permissions'),
    ('moderator', 'Moderator with elevated content management permissions')
ON CONFLICT (name) DO NOTHING;

-- Permissions
INSERT INTO permissions (name, description, resource, action) VALUES
    ('users:read', 'View user profiles', 'users', 'read'),
    ('users:write', 'Create and update users', 'users', 'write'),
    ('users:delete', 'Delete users', 'users', 'delete'),
    ('roles:read', 'View roles', 'roles', 'read'),
    ('roles:write', 'Create and update roles', 'roles', 'write'),
    ('media:read', 'View media files', 'media', 'read'),
    ('media:write', 'Upload media files', 'media', 'write'),
    ('media:delete', 'Delete media files', 'media', 'delete'),
    ('ai:read', 'Access AI features', 'ai', 'read'),
    ('ai:write', 'Create AI content', 'ai', 'write'),
    ('notifications:read', 'View notifications', 'notifications', 'read'),
    ('notifications:write', 'Send notifications', 'notifications', 'write'),
    ('webhooks:read', 'View webhooks', 'webhooks', 'read'),
    ('webhooks:write', 'Manage webhooks', 'webhooks', 'write')
ON CONFLICT (name) DO NOTHING;

-- Admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- User: read-only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'user'
  AND p.name IN ('users:read', 'media:read', 'ai:read', 'notifications:read', 'webhooks:read')
ON CONFLICT DO NOTHING;

-- Moderator: read + write (no delete)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'moderator'
  AND p.name IN (
    'users:read', 'users:write',
    'media:read', 'media:write',
    'ai:read', 'ai:write',
    'notifications:read', 'notifications:write',
    'webhooks:read', 'webhooks:write'
  )
ON CONFLICT DO NOTHING;
