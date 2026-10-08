/**
 * Deliberately `common`: the app registration accepts any organizational directory and personal
 * Microsoft accounts. Overridable (`MICROSOFT_AUTHORITY`) so the local mock authority can stand in.
 */
export const MICROSOFT_AUTH = {
  DEFAULT_AUTHORITY: 'https://login.microsoftonline.com/common',
  // No Graph scope and no `offline_access`: sign-in only, and no Microsoft token is ever stored.
  SCOPES: ['openid', 'email', 'profile'],
  AUTHORIZE_PATH: '/oauth2/v2.0/authorize',
  TOKEN_PATH: '/oauth2/v2.0/token',
  JWKS_PATH: '/discovery/v2.0/keys',
} as const;

/** Same role as `GOOGLE_AUTH_SID_COOKIE_*`: binds the round trip to the browser that started it. SameSite=Lax, since Microsoft returns via a top-level GET. */
export const MICROSOFT_AUTH_SID_COOKIE_NAME = 'microsoft_auth_sid';
export const MICROSOFT_AUTH_SID_COOKIE_PATH = '/v1/auth';
