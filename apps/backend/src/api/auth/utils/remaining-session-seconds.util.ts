import { ACCESS_TOKEN_TTL_SECONDS } from '../constants/auth.constants';

/**
 * Remaining lifetime of the presented token, so re-signing mid-session cannot extend an admin
 * session. Floored above zero (a zero/negative `expiresIn` mints a born-expired token), capped at
 * the full TTL; no `exp` falls back to the full TTL.
 */
export function remainingSessionSeconds(sessionExpiresAt: number | undefined): number {
  if (sessionExpiresAt === undefined) {
    return ACCESS_TOKEN_TTL_SECONDS;
  }

  const remaining = sessionExpiresAt - Math.floor(Date.now() / 1000);
  return Math.min(Math.max(remaining, 1), ACCESS_TOKEN_TTL_SECONDS);
}
