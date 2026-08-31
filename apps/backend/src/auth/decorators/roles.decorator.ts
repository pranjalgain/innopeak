import type { CustomDecorator } from '@nestjs/common';
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Sets required roles for a route. The RolesGuard uses OR logic:
 * the user needs at least ONE of the specified roles to access the route.
 *
 * @example
 * @Roles('admin', 'moderator')
 */
export const Roles = (...roles: string[]): CustomDecorator<string> => SetMetadata(ROLES_KEY, roles);
