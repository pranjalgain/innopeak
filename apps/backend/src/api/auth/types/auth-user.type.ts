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
  /** From the access token's `locale` claim — null if the admin never chose one, stale until the
   * token is refreshed. Same shape as `TenantAuthUser.locale`. */
  locale: Locale | null;
  /**
   * The presenting token's `exp` claim, in seconds since the epoch. Only routes that re-sign a
   * platform-admin token mid-session need it, so that the replacement expires at the *same*
   * instant as the token that authorized the call. Without that, any route handing back a freshly
   * signed token would double as a session-extension primitive: a platform admin has no refresh
   * token precisely so that a leaked access token dies within its 15 minutes, and a caller looping
   * such a route just under the TTL would keep the stolen session alive indefinitely.
   *
   * Optional because it is session metadata rather than identity — a caller that does not re-sign
   * has no business reading it, and a token somehow lacking `exp` simply falls back to the full
   * TTL at the one call site that cares.
   */
  sessionExpiresAt?: number;
}

/**
 * A guard/repository must narrow on `type` before trusting `tenantId` or `role` — a
 * platform-admin token has neither, and treating them as absent-but-fine on a tenant-scoped
 * query is a cross-tenant data leak, not a type error. See the auth API reference's Session /
 * token model section.
 */
export type AuthUser = PlatformAdminAuthUser | TenantAuthUser;
