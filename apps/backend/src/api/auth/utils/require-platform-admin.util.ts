import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { PlatformAdminOnlyException } from '../exceptions/auth.exceptions';
import type { AuthUser, PlatformAdminAuthUser } from '../types/auth-user.type';

/**
 * Narrows `@CurrentUser()`'s `AuthUser` to a `PlatformAdminAuthUser` — the platform-admin
 * counterpart to `requireTenantUser`. Every admin-area route is already gated by
 * `@Roles(JwtTokenType.PLATFORM_ADMIN)` (see `RolesGuard`), so this should never actually throw in
 * practice; it exists so a handler's own code can read `user.id`/`user.email` as facts the type
 * system guarantees, the same reasoning `requireTenantUser` documents for its own case.
 */
export function requirePlatformAdmin(user: AuthUser, message: string): PlatformAdminAuthUser {
  if (user.type !== JwtTokenType.PLATFORM_ADMIN) {
    throw new PlatformAdminOnlyException(message);
  }
  return user;
}
