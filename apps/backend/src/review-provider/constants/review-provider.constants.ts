/**
 * Google serves the two halves from two different hosts: locations moved to the Business
 * Information API, but reviews still live on the legacy v4 `mybusiness` host. Calling
 * `.../v4/{location}/reviews` on the wrong host returns a 404 that reads like "no reviews".
 */
export const GBP_HOSTS = {
  BUSINESS_INFORMATION: 'https://mybusinessbusinessinformation.googleapis.com/v1',
  ACCOUNT_MANAGEMENT: 'https://mybusinessaccountmanagement.googleapis.com/v1',
  /** Reviews only. Legacy, and there is no v1 replacement. */
  LEGACY_V4: 'https://mybusiness.googleapis.com/v4',
} as const;

export const GOOGLE_OAUTH = {
  AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  TOKEN_URL: 'https://oauth2.googleapis.com/token',
  REVOKE_URL: 'https://oauth2.googleapis.com/revoke',
  /**
   * `business.manage` is the only scope the Business Profile APIs gate on, with no read-only
   * variant; watch for partial-scope consent.
   */
  SCOPES: ['https://www.googleapis.com/auth/business.manage'],
} as const;

/** Google caps the accounts list at 20 per page. */
export const GBP_ACCOUNTS_PAGE_SIZE = 20;

/** The fields Google requires on a locations read; omitting `readMask` is a 400, not a default. */
export const GBP_LOCATION_READ_MASK = 'name,title,storefrontAddress,websiteUri,phoneNumbers';

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

export const CREDENTIAL_REFRESH_LOCK_TTL_SECONDS = 30;
