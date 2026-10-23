import type { Request } from 'express';

import { fromAccessTokenCookie } from '../../auth/utils/jwt-cookie-extractor.util';

/**
 * Claims of the access token on the request, read off the token the guard has already verified (so no signature check here).
 * Null when it cannot be read, e.g. a Bearer caller with no cookie or an unexpected shape.
 */
function readClaims(req: Request): { exp?: unknown; iat?: unknown } | null {
  const token = fromAccessTokenCookie(req) ?? bearerToken(req);
  const payload = token?.split('.')[1];
  if (payload === undefined) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown;
      iat?: unknown;
    };
  } catch {
    return null;
  }
}

/** Milliseconds until the caller's access token expires; `fallbackMs` when it cannot be read. */
export function msUntilAccessTokenExpiry(req: Request, fallbackMs: number): number {
  const exp = readClaims(req)?.exp;
  return typeof exp === 'number' ? Math.max(0, exp * 1000 - Date.now()) : fallbackMs;
}

/** When the caller's access token was issued (epoch seconds), for a revocation check; undefined when it cannot be read. */
export function accessTokenIssuedAt(req: Request): number | undefined {
  const iat = readClaims(req)?.iat;
  return typeof iat === 'number' ? iat : undefined;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}
