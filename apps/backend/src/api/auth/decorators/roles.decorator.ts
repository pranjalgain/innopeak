import type { CustomDecorator } from '@nestjs/common';
import { SetMetadata } from '@nestjs/common';

import type { UserRole } from '../enums/user-role.enum';

export const ROLES_KEY = 'roles';

/**
 * Sets required roles for a route. The RolesGuard uses OR logic:
 * the user needs at least ONE of the specified roles to access the route.
 *
 * Typed as `UserRole[]` rather than `string[]` on purpose: a raw literal at a call site would
 * otherwise compile and then silently never match `users.role`.
 *
 * @example
 * @Roles(UserRole.OWNER, UserRole.MEMBER)
 */
export const Roles = (...roles: UserRole[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);
