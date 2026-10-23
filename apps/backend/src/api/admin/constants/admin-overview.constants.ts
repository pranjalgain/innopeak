export const ACTIVITY_LOG_PAGE_SIZE_DEFAULT = 20;
export const ACTIVITY_LOG_PAGE_SIZE_MAX = 100;

/**
 * How long the platform-wide Overview and Statistics aggregates may be served from memory. Short enough that an admin
 * who just acted sees near-current numbers; long enough that repeated page loads don't each rescan `reviews`.
 */
export const ADMIN_AGGREGATE_CACHE_TTL_MS = 60_000;

/** The Businesses and Users lists: matches the screens' page size; the cap keeps any one response bounded. */
export const ADMIN_LIST_PAGE_SIZE_DEFAULT = 10;
export const ADMIN_LIST_PAGE_SIZE_MAX = 100;
/** Far past any real list, and keeps `(page - 1) * pageSize` inside what Postgres accepts as an OFFSET: a larger page was a 500, not a 400. */
export const ADMIN_LIST_PAGE_MAX = 100_000;
