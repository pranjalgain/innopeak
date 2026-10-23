import { shouldUseSecureCookies } from '@config/deployment-target.util';
import type { CookieOptions } from 'express';

/** Only `path` and `maxAge` differ between tenant and admin session cookies. */
export function buildCookieOptions(path: string, maxAgeSeconds?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: 'lax',
    path,
    ...(maxAgeSeconds === undefined ? {} : { maxAge: maxAgeSeconds * 1000 }),
  };
}

/**
 * Never `httpOnly`: the `session` routing-hint cookie carries no credential, and client-side
 * readability spares the frontend a JS-readable JWT copy in `localStorage`.
 */
export function buildSessionHintCookieOptions(path: string, maxAgeSeconds?: number): CookieOptions {
  return { ...buildCookieOptions(path, maxAgeSeconds), httpOnly: false };
}
