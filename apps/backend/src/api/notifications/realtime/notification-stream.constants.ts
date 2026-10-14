/** The Redis pub/sub channel the worker (and API) publish "something new for these users" to, and every API replica listens on. */
export const NOTIFICATION_EVENTS_CHANNEL = 'notifications:events';

/** A comment-sized event every 25 seconds keeps proxies and load balancers (idle timeouts of 60s and up) from closing a quiet stream. */
export const NOTIFICATION_STREAM_HEARTBEAT_MS = 25_000;

/**
 * Hard ceiling on a stream's life, in case a token outlives it. In practice the access token (15 minutes) ends it sooner, which also
 * ends the stream of a user who signed out or was disabled; the client then refreshes its session and reconnects.
 */
export const NOTIFICATION_STREAM_MAX_LIFETIME_MS = 30 * 60 * 1000;

/** A user with more open tabs than this loses the oldest stream (the newest wins), so a runaway client cannot hold hundreds. */
export const NOTIFICATION_STREAMS_PER_USER = 3;

/** A stream's slot is held from the moment it is opened; if nothing subscribes to it within this long the slot is given back. */
export const NOTIFICATION_STREAM_SUBSCRIBE_GRACE_MS = 10_000;

/** A replica's ceiling on open streams; past it new ones are refused with 503 and the client falls back to polling. */
export const NOTIFICATION_STREAMS_PER_REPLICA = 5_000;

/** How long a publish waits for Redis; the shared client waits forever on a dead connection, and a notice must not hang its producer. */
export const NOTIFICATION_PUBLISH_TIMEOUT_MS = 500;

/** Users per Redis message, so one tenant-wide notice for a huge tenant is a few small messages rather than one large one. */
export const NOTIFICATION_PUBLISH_CHUNK = 200;
