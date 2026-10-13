import { UserIdentityProvider } from '../enums/user-identity-provider.enum';

/** Which identity provider a sign-in round trip is with. Doubles as the `user_identity_provider` mapping key. */
export enum SsoProvider {
  GOOGLE = 'google',
  MICROSOFT = 'microsoft',
}

/** The `user_identity_provider` value a provider's identities are stored under. */
export const IDENTITY_PROVIDER_FOR: Record<SsoProvider, UserIdentityProvider> = {
  [SsoProvider.GOOGLE]: UserIdentityProvider.GOOGLE,
  [SsoProvider.MICROSOFT]: UserIdentityProvider.ENTRA_ID,
};

export const OAUTH_STATE_TTL_SECONDS = 600;

/** Namespaced per provider so a state minted for one can never be consumed at the other's callback. */
export const oauthStateKey = (provider: SsoProvider, nonce: string): string =>
  `auth:oauth-state:${provider}:${nonce}`;

/**
 * Carries a verified SSO identity from the callback to `POST /v1/auth/sso/complete-signup`. Unlike
 * the per-provider `*_auth_sid` cookie it is the sole credential: it never appears in a forwardable
 * URL, so the mailed-consent-link attack doesn't apply.
 */
/**
 * TRANSITIONAL: names from before Google's pending signup became provider-neutral, still read so a Google signup sitting on
 * the business-name step at deploy time can finish (the record lives 15 minutes). Delete one release after this ships.
 */
export const LEGACY_GOOGLE_PENDING_SIGNUP_COOKIE_NAME = 'google_pending_signup';
export const LEGACY_GOOGLE_PENDING_SIGNUP_KEY_PREFIX = 'auth:google-pending-signup:';

export const SSO_PENDING_SIGNUP_COOKIE_NAME = 'sso_pending_signup';
export const SSO_PENDING_SIGNUP_COOKIE_PATH = '/v1/auth';

/** Longer than the OAuth round trip: the visitor must type a business name. */
export const SSO_PENDING_SIGNUP_TTL_SECONDS = 900;

export const SSO_PENDING_SIGNUP_KEY_PREFIX = 'auth:sso-pending-signup:';

/** Relative to the web app's origin. */
export const SSO_REDIRECT = {
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
export enum SsoAuthFailure {
  /** `state` missing, malformed, expired, replayed, or from a different browser. */
  INVALID_STATE = 'INVALID_STATE',
  /** The user declined at the provider's consent screen. */
  ACCESS_DENIED = 'ACCESS_DENIED',
  /** The provider refused the code exchange, or its profile/ID token could not be read or validated. */
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  /** The provider returned an identity whose email it has not verified (for Microsoft: no `xms_edov` claim, or no `email` claim). */
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  /** Login intent, but no account exists for this identity or email. */
  NO_ACCOUNT = 'NO_ACCOUNT',
  /** The matched account is disabled, or its tenant is suspended. */
  ACCOUNT_UNAVAILABLE = 'ACCOUNT_UNAVAILABLE',
  /** The address belongs to a pending team invite; it can only be accepted from the invite link. */
  INVITE_REQUIRED = 'INVITE_REQUIRED',
  /** The provider's client id / secret / callback URL are not configured on this server. */
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  /** `ADMIN_INVITE`/`INVITE`: the invite token was never valid, already accepted, or has expired. */
  INVALID_OR_EXPIRED_INVITE = 'INVALID_OR_EXPIRED_INVITE',
  /** `ADMIN_INVITE`/`INVITE`: verified email differs from the invited address; the token stays unconsumed. */
  INVITE_EMAIL_MISMATCH = 'INVITE_EMAIL_MISMATCH',
  /** `ADMIN_INVITE`/`INVITE`: this Google account is already linked to a *different* admin/member. */
  GOOGLE_IDENTITY_ALREADY_LINKED = 'GOOGLE_IDENTITY_ALREADY_LINKED',
}
