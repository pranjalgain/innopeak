import { ReturnTo } from '../enums/return-to.enum';

/** Machine-facing codes the frontend branches on; distinct from MESSAGES, which is human copy. */
export const CONNECTION_ERROR_CODES = {
  CONNECTION_NOT_FOUND: 'CONNECTION_NOT_FOUND',
  LOCATION_NOT_FOUND: 'LOCATION_NOT_FOUND',
  LOCATION_INACTIVE: 'LOCATION_INACTIVE',
  EXTERNAL_LOCATION_NOT_FOUND: 'EXTERNAL_LOCATION_NOT_FOUND',
  CONNECTION_NEEDS_REAUTH: 'CONNECTION_NEEDS_REAUTH',
  LOCATION_LIMIT_REACHED: 'LOCATION_LIMIT_REACHED',
  BACKFILL_ENQUEUE_FAILED: 'BACKFILL_ENQUEUE_FAILED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  ACCOUNT_CHOICE_EXPIRED: 'ACCOUNT_CHOICE_EXPIRED',
  ACCOUNT_NOT_IN_CHOICE: 'ACCOUNT_NOT_IN_CHOICE',
  ACCOUNT_MISMATCH: 'ACCOUNT_MISMATCH',
} as const;

/**
 * Appended as `?error=<code>` on the callback's 302, never a JSON body: the user is mid-browser-
 * navigation and JSON would paint as a document.
 */
export const OAUTH_ERROR_CODES = {
  INVALID_STATE: 'INVALID_STATE',
  ACCESS_DENIED: 'ACCESS_DENIED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  ACCOUNT_MISMATCH: 'ACCOUNT_MISMATCH',
  /**
   * Partial-scope consent yields a connection that authorizes but cannot read reviews,
   * indistinguishable from a working one until the first backfill fails.
   */
  INSUFFICIENT_SCOPE: 'INSUFFICIENT_SCOPE',
  SERVER_ERROR: 'SERVER_ERROR',
} as const;

export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[keyof typeof OAUTH_ERROR_CODES];

/**
 * Resolved against an allowlist, never used as a URL: a raw `returnTo` would make the callback an
 * open redirect. `Record<ReturnTo, …>` forces a path for every new enum member.
 */
export const RETURN_TO_PATHS: Record<ReturnTo, string> = {
  [ReturnTo.ONBOARDING]: '/onboarding/connect',
  [ReturnTo.SETTINGS]: '/settings?tab=connection',
};

export const DEFAULT_RETURN_TO = ReturnTo.ONBOARDING;

/**
 * `SameSite=Lax` because the callback is a top-level GET navigation from Google; Strict would drop
 * the cookie on exactly that request and fail every connect as INVALID_STATE.
 */
export const OAUTH_SID_COOKIE_NAME = 'gbp_oauth_sid';
export const OAUTH_SID_COOKIE_PATH = '/v1/connections';
export const OAUTH_STATE_TTL_SECONDS = 600;

/**
 * How long the owner has to pick a Business Profile account after consenting. The grant's tokens wait in
 * Redis (encrypted) for this long, so it is kept short.
 */
export const PENDING_ACCOUNT_CHOICE_TTL_SECONDS = 900;

/** Appended to the connect screen's URL when the grant manages several accounts; the screen then shows the picker. */
export const ACCOUNT_CHOICE_QUERY = 'account_choice=pending';

/**
 * Sanity ceiling against a pathological Google account or an oversized `externalLocationIds` array.
 * An application rule only; the `locations` schema does not cap rows per tenant.
 */
export const MAX_ACTIVE_LOCATIONS = 50;

/** The backfill poll runs every ~2.5s; the global 30/min tier kills it inside the first minute. */
export const BACKFILL_POLL_THROTTLE = { limit: 120, ttl: 60000 } as const;

export const SYNC_RUNS_PAGE_SIZE_DEFAULT = 20;
export const SYNC_RUNS_PAGE_SIZE_MAX = 100;

/** Tolerance before a run is surfaced to the UI as `isStale`. */
export const STALE_RUN_MINUTES = 30;
