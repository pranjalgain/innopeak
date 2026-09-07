/**
 * Google serves the two halves of this integration from **two different hosts**, and this is a
 * genuine trap rather than trivia: locations moved to the modern Business Information API, while
 * reviews were never migrated and still live on the legacy v4 `mybusiness` host. Calling
 * `.../v4/{location}/reviews` on the Business Information host returns a 404 that reads exactly
 * like "this location has no reviews".
 */
export const GBP_HOSTS = {
  /** Locations. */
  BUSINESS_INFORMATION: 'https://mybusinessbusinessinformation.googleapis.com/v1',
  /** Accounts. */
  ACCOUNT_MANAGEMENT: 'https://mybusinessaccountmanagement.googleapis.com/v1',
  /** Reviews only. Legacy, and there is no v1 replacement. */
  LEGACY_V4: 'https://mybusiness.googleapis.com/v4',
} as const;

export const GOOGLE_OAUTH = {
  AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  TOKEN_URL: 'https://oauth2.googleapis.com/token',
  REVOKE_URL: 'https://oauth2.googleapis.com/revoke',
  /**
   * `business.manage` is the single scope the Business Profile APIs gate on — there is no
   * narrower read-only variant, which is why partial-scope consent is worth watching for.
   */
  SCOPES: ['https://www.googleapis.com/auth/business.manage'],
} as const;

/** The fields Google requires on a locations read; omitting `readMask` is a 400, not a default. */
export const GBP_LOCATION_READ_MASK = 'name,title,storefrontAddress,websiteUri';

/** Google caps this at 50 for reviews; asking for more is silently clamped. */
export const GBP_REVIEWS_PAGE_SIZE = 50;

/** One of the three orderings the v4 reviews list supports (`rating`, `rating desc`, `updateTime desc`). */
export const GBP_REVIEWS_ORDER_BY = 'updateTime desc';

/** Bounded retries for a 429 mid-import — see ReviewSyncQueueService.listReviewsWithBackoff. */
export const RATE_LIMIT_MAX_RETRIES = 3;
export const RATE_LIMIT_DEFAULT_WAIT_SECONDS = 30;
export const RATE_LIMIT_MAX_WAIT_SECONDS = 120;

/**
 * Refresh a token this long before it actually expires. Long enough to cover a slow backfill page
 * plus clock skew between us and Google — a token that expires mid-page turns a working sync into
 * a spurious `needs_reauth`.
 */
export const TOKEN_REFRESH_SKEW_SECONDS = 300;

/** How long a single credential refresh may hold its Redis lock. */
export const CREDENTIAL_REFRESH_LOCK_TTL_SECONDS = 30;
