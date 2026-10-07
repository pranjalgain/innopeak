import type { CustomDecorator } from '@nestjs/common';
import { SetMetadata } from '@nestjs/common';

import type { JwtTokenType } from '../enums/jwt-token-type.enum';
import type { UserRole } from '../enums/user-role.enum';

export const ROLES_KEY = 'roles';

/** `JwtTokenType.PLATFORM_ADMIN` marks a route platform-admin-only; one decorator/guard serves both to avoid a near-identical second guard. */
export type RoleRequirement = JwtTokenType.PLATFORM_ADMIN | UserRole;

/** `RolesGuard` uses OR logic. Typed `RoleRequirement[]` so a raw literal that would never match `users.role` fails to compile. */
export const Roles = (...roles: RoleRequirement[]): CustomDecorator<string> =>
  SetMetadata(ROLES_KEY, roles);
