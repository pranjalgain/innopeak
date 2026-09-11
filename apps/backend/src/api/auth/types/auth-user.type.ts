import type { Locale } from '@common/i18n/locale';

import type { JwtTokenType } from '../enums/jwt-token-type.enum';
import type { UserRole } from '../enums/user-role.enum';

export interface TenantAuthUser {
  type: JwtTokenType.TENANT_USER;
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  /** From the access token's `locale` claim — null if the user never chose one, stale until the
   * token is refreshed. See `resolveLocale`'s call sites for how this is used. */
  locale: Locale | null;
}

export interface PlatformAdminAuthUser {
  type: JwtTokenType.PLATFORM_ADMIN;
  id: string;
  email: string;
}

/**
 * A guard/repository must narrow on `type` before trusting `tenantId` or `role` — a
 * platform-admin token has neither, and treating them as absent-but-fine on a tenant-scoped
 * query is a cross-tenant data leak, not a type error. See the auth API reference's Session /
 * token model section.
 */
export type AuthUser = PlatformAdminAuthUser | TenantAuthUser;
