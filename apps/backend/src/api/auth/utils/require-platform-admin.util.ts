import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { PlatformAdminOnlyException } from '../exceptions/auth.exceptions';
import type { AuthUser, PlatformAdminAuthUser } from '../types/auth.type';

/**
 * Platform-admin counterpart to `requireTenantUser`; `@Roles` already gates admin routes, so this
 * throws only on misconfiguration.
 */
export function requirePlatformAdmin(user: AuthUser, message: string): PlatformAdminAuthUser {
  if (user.type !== JwtTokenType.PLATFORM_ADMIN) {
    throw new PlatformAdminOnlyException(message);
  }
  return user;
}
