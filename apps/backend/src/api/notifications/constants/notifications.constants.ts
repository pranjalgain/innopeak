/** The cap stops a client requesting the whole feed history in one call. */
export const NOTIFICATIONS_LIMIT_DEFAULT = 20;
export const NOTIFICATIONS_LIMIT_MAX = 50;

/** Keeps `offset` a sane bigint for Postgres; a guard against absurd input, not a paging limit. */
export const NOTIFICATIONS_OFFSET_MAX = 1_000_000;
