/** The cap stops a client requesting the whole feed history in one call. */
export const NOTIFICATIONS_LIMIT_DEFAULT = 20;
export const NOTIFICATIONS_LIMIT_MAX = 50;

/**
 * How long bell entries are kept. A read notice has done its job quickly; an unread one is kept longer in case the person was away.
 * Without a purge the table grows with every review for every user, forever.
 */
export const NOTIFICATION_READ_RETENTION_DAYS = 90;
export const NOTIFICATION_UNREAD_RETENTION_DAYS = 180;

/** Keeps `offset` a sane bigint for Postgres; a guard against absurd input, not a paging limit. */
export const NOTIFICATIONS_OFFSET_MAX = 1_000_000;
