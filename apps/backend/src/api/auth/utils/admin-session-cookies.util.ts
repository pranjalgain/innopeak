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
 * Shared by every admin sign-in path so cookie shape never drifts. `session=admin` is the routing
 * hint read by `proxy.ts` and the client route guards.
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
    // No refresh token can extend it, so the hint shares the access token's TTL.
    buildSessionHintCookieOptions(SESSION_HINT_COOKIE_PATH, ACCESS_TOKEN_TTL_SECONDS)
  );
}
