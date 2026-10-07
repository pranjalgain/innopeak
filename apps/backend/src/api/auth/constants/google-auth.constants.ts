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
} as const;

/**
 * Binds the round trip to the browser that started it; otherwise the signed `state` is a bearer
 * credential an attacker could mail to a victim to graft the victim's Google identity onto the
 * attacker's session. Must be `SameSite=Lax`: Google returns via a top-level GET, which Strict drops.
 */
export const GOOGLE_AUTH_SID_COOKIE_NAME = 'google_auth_sid';
export const GOOGLE_AUTH_SID_COOKIE_PATH = '/v1/auth';

export const GOOGLE_AUTH_STATE_TTL_SECONDS = 600;

export const GOOGLE_AUTH_STATE_KEY_PREFIX = 'auth:google-oauth-state:';

/**
 * Carries a verified Google identity from the callback to `POST /v1/auth/google/complete-signup`.
 * Unlike `google_auth_sid` it is the sole credential: it never appears in a forwardable URL, so
 * the mailed-consent-link attack doesn't apply.
 */
export const GOOGLE_PENDING_SIGNUP_COOKIE_NAME = 'google_pending_signup';
export const GOOGLE_PENDING_SIGNUP_COOKIE_PATH = '/v1/auth';

/** Longer than the OAuth round trip: the visitor must type a business name. */
export const GOOGLE_PENDING_SIGNUP_TTL_SECONDS = 900;

export const GOOGLE_PENDING_SIGNUP_KEY_PREFIX = 'auth:google-pending-signup:';

/** Relative to the web app's origin. */
export const GOOGLE_AUTH_REDIRECT = {
  SUCCESS: '/dashboard',
  LOGIN: '/login',
  SIGNUP: '/onboarding/signup',
  NEEDS_BUSINESS_NAME: '/onboarding/business-name',
  ADMIN_SUCCESS: '/admin',
  // Failures on an admin-context round trip; `LOGIN` has no admin sign-in path.
  ADMIN_LOGIN: '/admin-login',
  // `INVITE` failures with no token to build an accept URL from. Not `/accept-invite`: only
  // `/accept-invite/:token` exists, and a 404 would never read `?error=`.
  MEMBER_INVITE: '/login',
} as const;

/** `?error=` codes on the callback redirect; the browser is mid-navigation, so a JSON error body would render as a page. */
export enum GoogleAuthFailure {
  /** `state` missing, malformed, expired, replayed, or from a different browser. */
  INVALID_STATE = 'INVALID_STATE',
  /** The user declined at Google's consent screen. */
  ACCESS_DENIED = 'ACCESS_DENIED',
  /** Google refused the code exchange, or userinfo failed. */
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  /** Google returned a profile whose email it has not verified. */
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  /** Login intent, but no account exists for this identity or email. */
  NO_ACCOUNT = 'NO_ACCOUNT',
  /** The matched account is disabled, or its tenant is suspended. */
  ACCOUNT_UNAVAILABLE = 'ACCOUNT_UNAVAILABLE',
  /** GOOGLE_CLIENT_ID / SECRET / CALLBACK_URL are not configured on this server. */
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  /** `ADMIN_INVITE`/`INVITE`: the invite token was never valid, already accepted, or has expired. */
  INVALID_OR_EXPIRED_INVITE = 'INVALID_OR_EXPIRED_INVITE',
  /** `ADMIN_INVITE`/`INVITE`: verified email differs from the invited address; the token stays unconsumed. */
  INVITE_EMAIL_MISMATCH = 'INVITE_EMAIL_MISMATCH',
  /** `ADMIN_INVITE`/`INVITE`: this Google account is already linked to a *different* admin/member. */
  GOOGLE_IDENTITY_ALREADY_LINKED = 'GOOGLE_IDENTITY_ALREADY_LINKED',
}
