import { ACCESS_TOKEN_TTL_SECONDS } from '../constants/auth.constants';

/**
 * Lifetime left on the access token the caller presented, for the routes that re-sign a
 * platform-admin token mid-session to refresh a claim (today only
 * `AdminSettingsService.updateLocale`). Signing the replacement with this instead of the full TTL
 * is what stops such a route from doubling as a session-extension primitive — see
 * `PlatformAdminAuthUser.sessionExpiresAt` for why an admin session must stay un-renewable.
 *
 * Clamped at both ends. The floor keeps `expiresIn` positive: a token this close to expiry has
 * already passed the guard, and handing `jsonwebtoken` a zero or negative lifetime would mint
 * something born expired. The ceiling means a token claiming an implausibly distant `exp` still
 * cannot buy more than the normal TTL. A token with no `exp` at all falls back to the full TTL —
 * it cannot be extending anything, since nothing established a deadline to extend.
 */
export function remainingSessionSeconds(sessionExpiresAt: number | undefined): number {
  if (sessionExpiresAt === undefined) {
    return ACCESS_TOKEN_TTL_SECONDS;
  }

  const remaining = sessionExpiresAt - Math.floor(Date.now() / 1000);
  return Math.min(Math.max(remaining, 1), ACCESS_TOKEN_TTL_SECONDS);
}
