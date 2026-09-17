/** Module-local, non-user-facing constants for Google sign-in. Not the Business Profile client. */

/**
 * Deliberately a different OAuth client from `GBP_*`. Sharing one would mean an owner revoking
 * review access also loses the ability to sign in, and it would force the login flow to request
 * `business.manage` — a sensitive scope needing app verification — just to read an email address.
 */
export const GOOGLE_AUTH = {
  AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  TOKEN_URL: 'https://oauth2.googleapis.com/token',
  /**
   * OpenID Connect basics only. All three are non-sensitive, so this client needs no Google
   * verification review — unlike the Business Profile one, sign-in works the day it is created.
   */
  SCOPES: ['openid', 'email', 'profile'],
  USERINFO_URL: 'https://openidconnect.googleapis.com/v1/userinfo',
} as const;

/**
 * Binds the round trip to the browser that started it. Without it the signed `state` is a bearer
 * credential: an attacker holding a validly-signed one could mail the consent URL to a victim and
 * graft the victim's Google identity onto a session the attacker controls. The victim's browser
 * has no matching cookie, so the comparison fails and nothing is written.
 *
 * `SameSite=Lax` because Google returns through a top-level GET navigation, which Lax permits and
 * Strict does not — Strict would drop the cookie on exactly the request that needs it.
 */
export const GOOGLE_AUTH_SID_COOKIE_NAME = 'google_auth_sid';
export const GOOGLE_AUTH_SID_COOKIE_PATH = '/v1/auth';

/** A consent round trip that takes longer than this has been abandoned. */
export const GOOGLE_AUTH_STATE_TTL_SECONDS = 600;

/** Redis key holding the authoritative record for a nonce — see GoogleOAuthStateService. */
export const GOOGLE_AUTH_STATE_KEY_PREFIX = 'auth:google-oauth-state:';

/**
 * Carries a verified-but-not-yet-a-tenant Google identity from the callback to
 * `POST /v1/auth/google/complete-signup` — see PendingGoogleSignupService. Unlike
 * `google_auth_sid`, this is the sole credential (no separate binding cookie): it never appears in
 * a URL Google echoes back or a link that could be forwarded, so the "mailed consent link" attack
 * `google_auth_sid` defends against doesn't apply — an httpOnly, single-use, short-TTL random
 * value is the same security model the `refresh_token` cookie already relies on.
 */
export const GOOGLE_PENDING_SIGNUP_COOKIE_NAME = 'google_pending_signup';
export const GOOGLE_PENDING_SIGNUP_COOKIE_PATH = '/v1/auth';

/** Longer than the OAuth round trip's TTL — the visitor now has to read a new screen and type a business name. */
export const GOOGLE_PENDING_SIGNUP_TTL_SECONDS = 900;

/** Redis key holding the authoritative record for a pending-signup nonce — see PendingGoogleSignupService. */
export const GOOGLE_PENDING_SIGNUP_KEY_PREFIX = 'auth:google-pending-signup:';

/** Where the callback sends the browser, by outcome. Relative to the web app's origin. */
export const GOOGLE_AUTH_REDIRECT = {
  SUCCESS: '/dashboard',
  LOGIN: '/login',
  SIGNUP: '/onboarding/signup',
  /** A genuinely new signup lands here to supply the one thing Google cannot: a business name. */
  NEEDS_BUSINESS_NAME: '/onboarding/business-name',
  /** Where a completed `ADMIN_INVITE` round trip lands — the admin console, not the tenant dashboard. */
  ADMIN_SUCCESS: '/admin',
  /**
   * The admin-side counterpart to `LOGIN`, for a failure on an admin-context round trip
   * (`ADMIN_LOGIN`/`ADMIN_INVITE`). Since the tenant/admin login split, `LOGIN` carries no admin
   * sign-in path at all, so sending an admin there leaves them with nothing to do.
   */
  ADMIN_LOGIN: '/admin-login',
} as const;

/**
 * `?error=` codes the callback puts on the redirect. The browser is mid-navigation, so a JSON
 * error body would paint as a document — every failure has to come back as a redirect the SPA can
 * read and turn into a message.
 */
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
  /** `ADMIN_INVITE` only: the invite token was never valid, already accepted, or has expired. */
  INVALID_OR_EXPIRED_INVITE = 'INVALID_OR_EXPIRED_INVITE',
  /**
   * `ADMIN_INVITE` only: the Google account's verified email does not match the invited address —
   * the check that stops someone other than the invited person from redeeming this link with their
   * own unrelated Google account. Token is left unconsumed.
   */
  INVITE_EMAIL_MISMATCH = 'INVITE_EMAIL_MISMATCH',
  /** `ADMIN_INVITE` only: this Google account is already linked to a *different* platform admin. */
  GOOGLE_IDENTITY_ALREADY_LINKED = 'GOOGLE_IDENTITY_ALREADY_LINKED',
}
