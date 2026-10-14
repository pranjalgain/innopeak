import type { Request } from 'express';

import { fromAccessTokenCookie } from '../../auth/utils/jwt-cookie-extractor.util';

/**
 * Milliseconds until the caller's access token expires, read off the token the guard has already verified (so no signature check
 * here). Falls back to `fallbackMs` when the token cannot be read, e.g. a Bearer caller with no cookie or an unexpected shape.
 */
export function msUntilAccessTokenExpiry(req: Request, fallbackMs: number): number {
  const token = fromAccessTokenCookie(req) ?? bearerToken(req);
  const payload = token?.split('.')[1];
  if (payload === undefined) {
    return fallbackMs;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof claims.exp === 'number'
      ? Math.max(0, claims.exp * 1000 - Date.now())
      : fallbackMs;
  } catch {
    return fallbackMs;
  }
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}
