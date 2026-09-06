/**
 * The `type` claim every JWT this module signs carries. `JwtStrategy` accepts only the two
 * principal types — anything else (a refresh token presented as a bearer token, a JWT from some
 * other issuer sharing the secret, a payload with no `type` at all) is rejected outright rather
 * than defaulting to a tenant user.
 */
export enum JwtTokenType {
  TENANT_USER = 'tenant_user',
  PLATFORM_ADMIN = 'platform_admin',
  REFRESH = 'refresh',
}
