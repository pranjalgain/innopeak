import type { JwtTokenType } from '../enums/jwt-token-type.enum';
import type { UserRole } from '../enums/user-role.enum';

export interface TenantJwtPayload {
  sub: string; // users.id
  tenantId: string;
  email: string;
  role: UserRole;
  type: JwtTokenType.TENANT_USER;
  iat?: number;
  exp?: number;
}

export interface PlatformAdminJwtPayload {
  sub: string; // platform_admins.id
  email: string;
  type: JwtTokenType.PLATFORM_ADMIN;
  iat?: number;
  exp?: number;
}

/**
 * Signed with JWT_REFRESH_SECRET, never JWT_SECRET, so it can't pass `JwtStrategy` on signature
 * alone; the `type` claim is the second, independent line — even with the two secrets equal
 * (the local-dev fallback), a refresh token presented as a bearer token is rejected.
 */
export interface RefreshJwtPayload {
  sub: string; // users.id
  jti: string;
  type: JwtTokenType.REFRESH;
  iat?: number;
  exp?: number;
}

/** What `JwtStrategy.validate` may receive — the access-token shapes it accepts, or anything else it must refuse. */
export type JwtPayload = PlatformAdminJwtPayload | TenantJwtPayload;
