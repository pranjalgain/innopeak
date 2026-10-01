import type { Response } from 'express';

import { buildCookieOptions, buildSessionHintCookieOptions } from './cookie-options.util';

import {
  ACCESS_TOKEN_COOKIE_PATH,
  ACCESS_TOKEN_TTL_SECONDS,
  ADMIN_ACCESS_TOKEN_COOKIE_NAME,
  SESSION_HINT_ADMIN_VALUE,
  SESSION_HINT_COOKIE_NAME,
  SESSION_HINT_COOKIE_PATH,
} from '../constants/auth.constants';

/**
 * Sets a platform admin's session cookies after a successful sign-in — shared by
 * `PlatformAdminAuthController` (login, invite accept) and `AuthController`'s Google callback
 * (the `admin_signed_in` branch, since that route stays shared across both principals — see
 * `separate-admin-login-design.md`), so the three ways an admin session gets established can
 * never drift on cookie shape.
 *
 * Just two cookies: `admin_access_token` (the credential) and `session=admin` (the routing hint
 * `proxy.ts` and the frontend's client-side route guards both read — see
 * `buildSessionHintCookieOptions`). Unlike the pre-split version of this function, there is nothing to *clear*
 * here — `admin_access_token` is its own cookie name, so a tenant session's own
 * `access_token`/`refresh_token` cookies simply cannot collide with it. (Logging out still clears
 * this cookie too, from the shared `POST /v1/auth/logout` — see `AuthController.clearSessionCookies`.)
 */
export function setAdminSessionCookies(res: Response, accessToken: string): void {
  res.cookie(
    ADMIN_ACCESS_TOKEN_COOKIE_NAME,
    accessToken,
    buildCookieOptions(ACCESS_TOKEN_COOKIE_PATH, ACCESS_TOKEN_TTL_SECONDS)
  );
  res.cookie(
    SESSION_HINT_COOKIE_NAME,
    SESSION_HINT_ADMIN_VALUE,
    // No refresh token to extend it, unlike a tenant's — the hint can't outlive the one thing
    // that can actually revive this session, so it shares the access token's own TTL.
    buildSessionHintCookieOptions(SESSION_HINT_COOKIE_PATH, ACCESS_TOKEN_TTL_SECONDS)
  );
}
