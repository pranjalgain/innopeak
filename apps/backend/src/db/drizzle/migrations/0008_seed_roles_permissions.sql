-- Seed roles
INSERT INTO roles (name, description) VALUES
    ('admin', 'Full system administrator with all permissions'),
    ('user', 'Standard user with basic permissions'),
    ('moderator', 'Moderator with elevated content management permissions')
ON CONFLICT (name) DO NOTHING;

-- Seed permissions
INSERT INTO permissions (name, description, resource, action) VALUES
    ('users:read', 'View user profiles', 'users', 'read'),
    ('users:write', 'Create and update users', 'users', 'write'),
    ('users:delete', 'Delete users', 'users', 'delete'),
    ('roles:read', 'View roles', 'roles', 'read'),
    ('roles:write', 'Create and update roles', 'roles', 'write'),
    ('media:read', 'View media files', 'media', 'read'),
    ('media:write', 'Upload media files', 'media', 'write'),
    ('media:delete', 'Delete media files', 'media', 'delete'),
    ('notifications:read', 'View notifications', 'notifications', 'read'),
    ('notifications:write', 'Send notifications', 'notifications', 'write')
ON CONFLICT (name) DO NOTHING;

-- Assign all permissions to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- Assign basic permissions to user role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'user' AND p.name IN ('users:read', 'media:read', 'media:write', 'notifications:read')
ON CONFLICT DO NOTHING;

-- Assign moderator permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'moderator' AND p.name IN ('users:read', 'users:write', 'media:read', 'media:write', 'media:delete', 'notifications:read', 'notifications:write')
ON CONFLICT DO NOTHING;
