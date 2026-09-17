import { RouteNames } from '@common/route-names';
import type { Request } from 'express';

import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

import { ADMIN_AREA_PATH_PREFIX, fromAccessTokenCookie } from './jwt-cookie-extractor.util';

import {
  ACCESS_TOKEN_COOKIE_NAME,
  ADMIN_ACCESS_TOKEN_COOKIE_NAME,
} from '../constants/auth.constants';

function requestWith(path: string, cookies: Record<string, string | undefined>): Request {
  return { path, cookies } as unknown as Request;
}

describe('fromAccessTokenCookie', () => {
  it('returns the access_token cookie value on a non-admin route when only it is present', () => {
    const req = requestWith('/v1/dashboard', { [ACCESS_TOKEN_COOKIE_NAME]: 'tenant-jwt' });

    expect(fromAccessTokenCookie(req)).toBe('tenant-jwt');
  });

  it('returns the admin_access_token cookie value on an admin route when only it is present', () => {
    const req = requestWith('/v1/admin/overview/review-stats', {
      [ADMIN_ACCESS_TOKEN_COOKIE_NAME]: 'admin-jwt',
    });

    expect(fromAccessTokenCookie(req)).toBe('admin-jwt');
  });

  /**
   * Regression target: giving admin sessions their own cookie name means a browser CAN hold both
   * at once (a tenant owner and a platform admin signed in together) — a fixed preference order
   * that always picked `access_token` first 403'd every admin-route request the moment a tenant
   * session was also live, since the wrong JWT reached `RolesGuard`. Which cookie is present is not
   * enough to prove which one is the right one — the request path decides.
   */
  it('prefers admin_access_token on an admin route even when access_token is also present', () => {
    const req = requestWith('/v1/admin/overview/review-stats', {
      [ACCESS_TOKEN_COOKIE_NAME]: 'tenant-jwt',
      [ADMIN_ACCESS_TOKEN_COOKIE_NAME]: 'admin-jwt',
    });

    expect(fromAccessTokenCookie(req)).toBe('admin-jwt');
  });

  it('prefers access_token on a non-admin route even when admin_access_token is also present', () => {
    const req = requestWith('/v1/dashboard', {
      [ACCESS_TOKEN_COOKIE_NAME]: 'tenant-jwt',
      [ADMIN_ACCESS_TOKEN_COOKIE_NAME]: 'admin-jwt',
    });

    expect(fromAccessTokenCookie(req)).toBe('tenant-jwt');
  });

  it('falls back to admin_access_token on a non-admin route when access_token is absent', () => {
    const req = requestWith('/v1/dashboard', { [ADMIN_ACCESS_TOKEN_COOKIE_NAME]: 'admin-jwt' });

    expect(fromAccessTokenCookie(req)).toBe('admin-jwt');
  });

  it('falls back to access_token on an admin route when admin_access_token is absent', () => {
    const req = requestWith('/v1/admin/overview/review-stats', {
      [ACCESS_TOKEN_COOKIE_NAME]: 'tenant-jwt',
    });

    expect(fromAccessTokenCookie(req)).toBe('tenant-jwt');
  });

  it('returns null when neither cookie is present so ExtractJwt can fall through to the next extractor', () => {
    const req = requestWith('/v1/dashboard', { refresh_token: 'unrelated' });

    expect(fromAccessTokenCookie(req)).toBeNull();
  });

  it('returns null when req.cookies itself is undefined (cookie-parser not registered / no cookies sent)', () => {
    const req = { path: '/v1/dashboard' } as unknown as Request;

    expect(fromAccessTokenCookie(req)).toBeNull();
  });

  /**
   * The extractor recognizes the admin area by URL shape, because passport runs before Nest has
   * resolved the handler and so cannot read `@Roles`. That makes the mapping drift-prone: an
   * admin-only controller mounted outside `admin/` would silently authenticate as the tenant
   * principal for any browser holding both cookies, surfacing as an unexplained 403.
   *
   * This pins the coupling. If a new admin route slug lands somewhere else, this fails here —
   * loudly, in a file that explains the problem — instead of in production as a broken login.
   */
  describe('every admin-gated controller mounts under the prefix the extractor keys on', () => {
    /** Reads the real controllers rather than a hand-maintained list, so a new one is covered the day it lands. */
    function adminGatedControllerMounts(): { file: string; slug: string }[] {
      const apiRoot = resolve(__dirname, '../../../api');
      const mounts: { file: string; slug: string }[] = [];

      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
            continue;
          }
          if (!entry.name.endsWith('.controller.ts')) continue;

          const source = readFileSync(full, 'utf8');
          if (!source.includes('JwtTokenType.PLATFORM_ADMIN')) continue;

          const mount = /@Controller\(\{\s*path:\s*RouteNames\.([A-Z0-9_]+)/.exec(source);
          if (!mount?.[1]) continue;

          const slug = RouteNames[mount[1] as keyof typeof RouteNames];
          mounts.push({ file: entry.name, slug });
        }
      };

      walk(apiRoot);
      return mounts;
    }

    const mounts = adminGatedControllerMounts();

    it('finds the admin-gated controllers at all, so an empty sweep cannot pass vacuously', () => {
      expect(mounts.length).toBeGreaterThanOrEqual(4);
    });

    it.each(mounts)('$file mounts at "$slug", which resolves to the admin cookie', ({ slug }) => {
      expect(slug.startsWith(ADMIN_AREA_PATH_PREFIX)).toBe(true);

      const req = requestWith(`/v1/${slug}/anything`, {
        [ACCESS_TOKEN_COOKIE_NAME]: 'tenant-jwt',
        [ADMIN_ACCESS_TOKEN_COOKIE_NAME]: 'admin-jwt',
      });
      expect(fromAccessTokenCookie(req)).toBe('admin-jwt');
    });
  });
});
