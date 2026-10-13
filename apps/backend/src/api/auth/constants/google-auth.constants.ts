/**
 * Deliberately a different OAuth client from `GBP_*`: sharing one would tie sign-in to review
 * access and force the login flow to request the sensitive `business.manage` scope.
 */
export const GOOGLE_AUTH = {
  AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  TOKEN_URL: 'https://oauth2.googleapis.com/token',
  // Non-sensitive scopes only, so this client needs no Google verification review.
  SCOPES: ['openid', 'email', 'profile'],
  USERINFO_URL: 'https://openidconnect.googleapis.com/v1/userinfo',
  /** A hung Google socket would otherwise hold the sign-in request open for minutes. */
  HTTP_TIMEOUT_MS: 10_000,
} as const;

/**
 * Binds the round trip to the browser that started it; otherwise the signed `state` is a bearer
 * credential an attacker could mail to a victim to graft the victim's Google identity onto the
 * attacker's session. Must be `SameSite=Lax`: Google returns via a top-level GET, which Strict drops.
 */
export const GOOGLE_AUTH_SID_COOKIE_NAME = 'google_auth_sid';
export const GOOGLE_AUTH_SID_COOKIE_PATH = '/v1/auth';
