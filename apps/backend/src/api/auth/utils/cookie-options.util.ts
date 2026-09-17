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
