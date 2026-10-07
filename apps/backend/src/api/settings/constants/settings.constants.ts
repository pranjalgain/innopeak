/** Postgres `INTEGER` max; a larger value would be an uncaught `22003 value out of range` (a 500, not a 400). */
export const POSTGRES_INTEGER_MAX = 2147483647;

/** Most terms one tenant's blocklist may hold; the classifier scans every term against every new review. */
export const MAX_BLOCKLIST_TERMS_PER_TENANT = 100;
