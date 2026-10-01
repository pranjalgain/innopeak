import { isProduction } from '@config/deployment-target.util';
import type { CookieOptions } from 'express';

/**
 * Shared attributes for every session cookie this module sets — tenant and admin alike. Only
 * `path` and `maxAge` ever differ between them; extracted out of `AuthController` once
 * `PlatformAdminAuthController`/the shared Google callback all needed the identical shape.
 */
export function buildCookieOptions(path: string, maxAgeSeconds?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path,
    ...(maxAgeSeconds === undefined ? {} : { maxAge: maxAgeSeconds * 1000 }),
  };
}

/**
 * Same shape as `buildCookieOptions`, but never `httpOnly` — for the `session` routing-hint cookie
 * only. That cookie carries no credential (see `SESSION_HINT_COOKIE_NAME`'s own doc comment): its
 * value is just which kind of principal is signed in, read today by `proxy.ts`'s edge middleware.
 * Making it readable client-side too lets the frontend answer "am I signed in, and as what" with a
 * synchronous cookie read instead of decoding a JWT it would otherwise have to keep a second,
 * JS-readable copy of in `localStorage` — removing that copy is the actual security property this
 * exists for; this cookie was never sensitive enough to need `httpOnly` in the first place.
 */
export function buildSessionHintCookieOptions(path: string, maxAgeSeconds?: number): CookieOptions {
  return { ...buildCookieOptions(path, maxAgeSeconds), httpOnly: false };
}
