/** Module-local, non-user-facing constants — see messages.constants.ts for user-facing strings. */

/** Hash algorithm for password_reset_tokens.token_hash / refresh_tokens.token_hash — see the auth API reference's Security considerations. */
export const TOKEN_HASH_ALGORITHM = 'sha256';

/**
 * The only algorithm this module signs or accepts. Pinned at every verify so a token can never
 * dictate how it is checked — the classic algorithm-confusion shape. `jsonwebtoken` 9 already
 * refuses an asymmetric alg against a string secret, so this is defence in depth today; it is what
 * keeps that true if the secrets ever become key objects.
 */
export const JWT_SIGNING_ALGORITHM = 'HS256';

/** Floor for JWT_SECRET / JWT_REFRESH_SECRET, enforced by the Joi schema — HS256's security is bounded by the secret's entropy, and a short one is brute-forceable offline from any single captured token. */
export const JWT_SECRET_MIN_LENGTH = 32;

/** Raw refresh token size: 32 bytes (256 bits) of crypto.randomBytes, base64url-encoded. */
export const REFRESH_TOKEN_BYTES = 32;

/**
 * Password policy: ≥1 lowercase, ≥1 uppercase, ≥1 digit, ≥1 special — where "special" is any
 * non-alphanumeric, non-whitespace character, not an allowlist. The previous
 * `[@$!%*?&]` allowlist rejected perfectly strong passwords containing `#`, `-`, `_`, `~`, etc.
 * Spaces inside a password are allowed (passphrases); only line breaks are refused.
 */
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d\s])[^\r\n]+$/;

/** Verification codes are exactly six ASCII digits — anything else is rejected before it ever reaches a hash compare. */
export const OTP_LENGTH = 6;
export const OTP_PATTERN = /^\d{6}$/;

/** Access token TTL — see the auth API reference's Session / token model. */
export const ACCESS_TOKEN_TTL_SECONDS = 900;

/** Refresh token TTL — see the auth API reference's Session / token model. */
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

/**
 * httpOnly cookie the refresh token travels in — never in a JSON response body, so client-side
 * JS can't read or exfiltrate it. Scoped to `/v1/auth` only (not every request) since only
 * refresh/logout ever need to see it.
 */
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
export const REFRESH_TOKEN_COOKIE_PATH = '/v1/auth';

/**
 * httpOnly cookie the access token ALSO travels in, alongside its plain-JSON `accessToken` field
 * (`TokenResponseDto`) — the two aren't redundant, they serve different callers. The cookie is
 * what `JwtStrategy` actually authenticates same-origin browser requests against (see
 * `jwt-cookie-extractor.util.ts`); the JSON copy is what the frontend stores client-side
 * (`localStorage`, since an httpOnly cookie's value is invisible to its own JS) and sends as a
 * `Bearer` header, which `JwtStrategy` still accepts as a fallback for non-browser/non-cookie
 * clients (Swagger UI, a future mobile app, service-to-service calls). Scoped to `/` (not
 * `/v1/auth` like the refresh cookie) since every authenticated route needs to see it, not just
 * the auth module's own.
 */
export const ACCESS_TOKEN_COOKIE_NAME = 'access_token';
export const ACCESS_TOKEN_COOKIE_PATH = '/';

/**
 * Carries no credential — just "a session exists", so it is safe to scope broadly and to outlive
 * the 15-minute access token. It exists because the frontend's `proxy.ts` middleware has to decide
 * whether to render a page or redirect *before* any client JS runs, and the two cookies that do
 * carry credentials are both wrong for that job: `access_token` expires after 15 minutes (so an
 * idle-but-refreshable visitor would be bounced to /login), and `refresh_token` is deliberately
 * scoped to `/v1/auth` (so a browser never sends it on a page request at all). Lives exactly as
 * long as the refresh token, since that is precisely the window in which a session can still be
 * revived without re-authenticating.
 */
export const SESSION_HINT_COOKIE_NAME = 'session';
export const SESSION_HINT_COOKIE_PATH = '/';
export const SESSION_HINT_COOKIE_VALUE = '1';

/**
 * Per-account cap on verify-email OTP guesses. The global ThrottlerGuard only limits per IP, which
 * a distributed attacker sidesteps entirely; a 6-digit code with no per-account ceiling is
 * brute-forceable, and a successful guess mints a full session. Window matches the OTP's own TTL
 * so a fresh code always arrives with a fresh budget.
 */
export const OTP_MAX_ATTEMPTS = 10;
export const OTP_ATTEMPT_WINDOW_SECONDS = 600;

/**
 * Minimum gap between two OTP emails for one address. The upsert in
 * `AuthRepository.putVerifyEmailToken` *replaces* the live code, so without a cooldown anyone who
 * knows a pending address can both flood that inbox and keep overwriting the victim's code faster
 * than they can type it — a verification lockout, not just spam. The per-IP throttle does not
 * cover it (a distributed caller sidesteps it entirely, same reasoning as OTP_MAX_ATTEMPTS).
 */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/**
 * Per-account password-login ceiling, on top of the per-IP ThrottlerGuard.
 *
 * Per-IP is the wrong axis for credential stuffing: it arrives from many addresses, a few attempts
 * each, all aimed at one account, and never trips an IP limit. Counted per normalized email, and a
 * locked address gets the same `INVALID_CREDENTIALS` every other failure gets — a distinct
 * "locked" code would confirm both that the account exists and that the threshold was found.
 *
 * Deliberately an application-layer counter and never `users.status`, so a lockout can only slow
 * an attacker for one window and can never be weaponized to disable someone's account.
 */
export const LOGIN_LOCKOUT_THRESHOLD = 10;
export const LOGIN_LOCKOUT_WINDOW_SECONDS = 900;

/**
 * How recently a refresh token must have been revoked for presenting it again to count as a lost
 * rotation race rather than a replay.
 *
 * Two tabs waking from the same idle period both refresh; the loser presents a token the winner
 * revoked milliseconds ago, and its successor is already in the shared cookie jar — benign, and
 * clearing that session would sign the user out everywhere. A token revoked *minutes* ago has no
 * such excuse: the legitimate holder has long since moved on to its successor, so whoever still
 * has the spent copy most likely stole it. See `TokenService.rotate`.
 */
export const REFRESH_REUSE_GRACE_SECONDS = 10;
