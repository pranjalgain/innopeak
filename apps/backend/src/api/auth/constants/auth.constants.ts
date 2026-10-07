export const TOKEN_HASH_ALGORITHM = 'sha256';

/** Pinned at every verify so a token can never choose its own algorithm (algorithm confusion). */
export const JWT_SIGNING_ALGORITHM = 'HS256';

/** Floor for JWT_SECRET / JWT_REFRESH_SECRET: a short HS256 secret is brute-forceable offline from one captured token. */
export const JWT_SECRET_MIN_LENGTH = 32;

export const REFRESH_TOKEN_BYTES = 32;

/** "Special" is any non-alphanumeric, non-whitespace character, not an allowlist. Spaces are allowed (passphrases); only line breaks are refused. */
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d\s])[^\r\n]+$/;

export const OTP_LENGTH = 6;
export const OTP_PATTERN = /^\d{6}$/;

export const ACCESS_TOKEN_TTL_SECONDS = 900;

export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

/** httpOnly, never in a response body; scoped to `/v1/auth` since only refresh/logout need it. */
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
export const REFRESH_TOKEN_COOKIE_PATH = '/v1/auth';

/**
 * The access token also travels in the JSON body: the cookie authenticates same-origin browser
 * requests, the body copy serves the frontend's Bearer header and non-browser clients. Scoped to
 * `/` because every authenticated route needs it.
 */
export const ACCESS_TOKEN_COOKIE_NAME = 'access_token';
export const ACCESS_TOKEN_COOKIE_PATH = '/';

/**
 * Distinct from the tenant cookie name so a tenant and an admin session can coexist in one browser
 * without overwriting each other's credential. Scoped to `/` since admin routes span several prefixes.
 */
export const ADMIN_ACCESS_TOKEN_COOKIE_NAME = 'admin_access_token';

/**
 * Carries no credential, only "a session exists, and which kind", so it is safe to scope broadly.
 * The frontend's `proxy.ts` must route before any client JS runs, and neither credential cookie
 * works for that: `access_token` expires in 15 minutes and `refresh_token` is scoped to `/v1/auth`.
 * The tenant/admin value lets it keep each principal off the other's pages at the edge (otherwise
 * /login and its client-side guard bounce an admin back and forth forever).
 *
 * Lives as long as the session can be revived: the refresh TTL for a tenant, the access TTL for an
 * admin (who has no refresh token).
 */
export const SESSION_HINT_COOKIE_NAME = 'session';
export const SESSION_HINT_COOKIE_PATH = '/';
export const SESSION_HINT_TENANT_VALUE = 'tenant';
export const SESSION_HINT_ADMIN_VALUE = 'admin';

/**
 * Per-account cap on verify-email OTP guesses: the per-IP ThrottlerGuard doesn't stop a distributed
 * attacker, and a successful guess mints a session. Window matches the OTP TTL so a fresh code
 * gets a fresh budget.
 */
export const OTP_MAX_ATTEMPTS = 10;
export const OTP_ATTEMPT_WINDOW_SECONDS = 600;

/**
 * Minimum gap between OTP emails for one address. Each resend replaces the live code, so without
 * a cooldown anyone knowing a pending address can keep overwriting the victim's code (a
 * verification lockout); the per-IP throttle doesn't cover a distributed caller.
 */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/**
 * Per-account (normalized email) login ceiling: credential stuffing spreads across IPs and never
 * trips the per-IP limit. A locked address returns the same `INVALID_CREDENTIALS` as any failure,
 * since a distinct code would confirm the account exists. Never `users.status`, so a lockout can't
 * be weaponized to disable an account.
 */
export const LOGIN_LOCKOUT_THRESHOLD = 10;
export const LOGIN_LOCKOUT_WINDOW_SECONDS = 900;

/**
 * A spent refresh token re-presented within this window is a lost two-tab rotation race (benign);
 * older than that, the holder has moved on, so it is treated as theft. See `TokenService.rotate`.
 */
export const REFRESH_REUSE_GRACE_SECONDS = 10;

/**
 * Minimum age before `purgeStaleAuthTokens` deletes a revoked refresh token, so every token gets
 * the same replay-detection window regardless of when the daily cron runs relative to its revocation.
 */
export const REFRESH_TOKEN_REVOKED_RETENTION_HOURS = 24;
