import { ReturnTo } from '../enums/return-to.enum';

/** Machine-facing codes the frontend branches on. Distinct from MESSAGES, which is human copy. */
export const CONNECTION_ERROR_CODES = {
  CONNECTION_NOT_FOUND: 'CONNECTION_NOT_FOUND',
  LOCATION_NOT_FOUND: 'LOCATION_NOT_FOUND',
  EXTERNAL_LOCATION_NOT_FOUND: 'EXTERNAL_LOCATION_NOT_FOUND',
  CONNECTION_NEEDS_REAUTH: 'CONNECTION_NEEDS_REAUTH',
  LOCATION_LIMIT_REACHED: 'LOCATION_LIMIT_REACHED',
  BACKFILL_ENQUEUE_FAILED: 'BACKFILL_ENQUEUE_FAILED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
} as const;

/**
 * Appended as `?error=<code>` on the callback's 302 — never a JSON body, because the user is
 * mid-browser-navigation and a JSON error would paint as a document.
 */
export const OAUTH_ERROR_CODES = {
  INVALID_STATE: 'INVALID_STATE',
  ACCESS_DENIED: 'ACCESS_DENIED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  ACCOUNT_MISMATCH: 'ACCOUNT_MISMATCH',
  /**
   * Not in the original spec. Consent that grants *some* scopes yields a connection that
   * authorizes but cannot read reviews — indistinguishable from a working one until the first
   * backfill fails, at which point the owner is told to reconnect with no hint about what to do
   * differently.
   */
  INSUFFICIENT_SCOPE: 'INSUFFICIENT_SCOPE',
  SERVER_ERROR: 'SERVER_ERROR',
} as const;

export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[keyof typeof OAUTH_ERROR_CODES];

/**
 * `returnTo` is resolved against this allowlist, never used as a URL. Accepting a raw URL on the
 * authorize route would make the callback an open redirect — an attacker mails a consent link
 * whose `returnTo` points at their own site, and the victim lands there having just authorized.
 */
/** `Record<ReturnTo, …>` so adding a member to the enum is a compile error until it has a path. */
export const RETURN_TO_PATHS: Record<ReturnTo, string> = {
  [ReturnTo.ONBOARDING]: '/onboarding/connect',
  [ReturnTo.SETTINGS]: '/settings?tab=connection',
};

export const DEFAULT_RETURN_TO = ReturnTo.ONBOARDING;

/**
 * Binds an OAuth round trip to the browser that started it. `SameSite=Lax` because the callback
 * arrives as a top-level GET navigation from Google, which Lax permits and Strict does not —
 * Strict here would drop the cookie on exactly the request that needs it and make every legitimate
 * connect fail as INVALID_STATE.
 */
export const OAUTH_SID_COOKIE_NAME = 'gbp_oauth_sid';
export const OAUTH_SID_COOKIE_PATH = '/v1/connections';
export const OAUTH_STATE_TTL_SECONDS = 600;

/** MVP: one active location per tenant. An application rule — no database constraint backs it. */
export const MAX_ACTIVE_LOCATIONS = 1;

/** The backfill poll runs every ~2.5s; the global 30/min tier kills it inside the first minute. */
export const BACKFILL_POLL_THROTTLE = { limit: 120, ttl: 60000 } as const;

export const SYNC_RUNS_PAGE_SIZE_DEFAULT = 20;
export const SYNC_RUNS_PAGE_SIZE_MAX = 100;

/** PLAN.md §8.1's tolerance, surfaced to the UI as `isStale`. */
export const STALE_RUN_MINUTES = 30;
