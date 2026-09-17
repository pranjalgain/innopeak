/** `reviews.review_data_retention_months` (and other tenant-settings integer columns) is a
 * Postgres `INTEGER` — a value past this reaches the database as an uncaught
 * `22003 value out of range`, a 500 rather than a validation 400. */
export const POSTGRES_INTEGER_MAX = 2147483647;
