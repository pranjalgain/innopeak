import type { CustomDecorator } from '@nestjs/common';
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Sets required permissions for a route. The PermissionsGuard uses AND logic:
 * the user needs ALL of the specified permissions to access the route.
 *
 * @example
 * @Permissions('users:read', 'users:write')
 */
export const Permissions = (...permissions: string[]): CustomDecorator<string> =>
  SetMetadata(PERMISSIONS_KEY, permissions);
