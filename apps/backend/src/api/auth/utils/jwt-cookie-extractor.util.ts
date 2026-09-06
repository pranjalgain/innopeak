import type { Request } from 'express';

import { ACCESS_TOKEN_COOKIE_NAME } from '../constants/auth.constants';

/**
 * `passport-jwt` extractor: pulls the access token out of the httpOnly `access_token` cookie
 * (see `ACCESS_TOKEN_COOKIE_NAME`). Requires `cookie-parser` to already be registered
 * (`bootstrap.ts`) so `req.cookies` exists; returns null (not throws) when absent so
 * `ExtractJwt.fromExtractors` can fall through to the next extractor.
 */
export function fromAccessTokenCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[ACCESS_TOKEN_COOKIE_NAME] ?? null;
}
