/** `JwtStrategy` accepts only the two principal types; anything else (refresh token, missing `type`) is rejected, never defaulted to a tenant user. */
export enum JwtTokenType {
  TENANT_USER = 'tenant_user',
  PLATFORM_ADMIN = 'platform_admin',
  REFRESH = 'refresh',
}
