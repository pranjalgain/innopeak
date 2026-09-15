import type { CustomDecorator } from '@nestjs/common';
import { SetMetadata } from '@nestjs/common';

import type { JwtTokenType } from '../enums/jwt-token-type.enum';
import type { UserRole } from '../enums/user-role.enum';

export const ROLES_KEY = 'roles';

/**
 * A role requirement is either a tenant `UserRole`, or the literal
 * `JwtTokenType.PLATFORM_ADMIN` marking a route as platform-admin-only. The two never combine
 * meaningfully with OR logic in practice (a route is either tenant-scoped or platform-admin-scoped
 * in this schema's flat hierarchy), but reusing one decorator/guard for both avoids a second,
 * near-identical guard — see RolesGuard for how each is checked.
 */
export type RoleRequirement = JwtTokenType.PLATFORM_ADMIN | UserRole;

/**
 * Sets required roles for a route. The RolesGuard uses OR logic:
 * the user needs at least ONE of the specified roles to access the route.
 *
 * Typed as `RoleRequirement[]` rather than `string[]` on purpose: a raw literal at a call site
 * would otherwise compile and then silently never match `users.role`.
 *
 * @example
 * @Roles(UserRole.OWNER, UserRole.MEMBER)
 * @Roles(JwtTokenType.PLATFORM_ADMIN)
 */
export const Roles = (...roles: RoleRequirement[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);
