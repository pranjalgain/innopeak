import type { Request } from 'express';

import {
  ACCESS_TOKEN_COOKIE_NAME,
  ADMIN_ACCESS_TOKEN_COOKIE_NAME,
} from '../constants/auth.constants';

/**
 * Route-aware: `/v{n}/admin/...` tries `admin_access_token` first, anything else `access_token`
 * first, falling back to the other. A browser can hold both cookies, and a fixed order 403s admin
 * routes. Returns null rather than throwing so `ExtractJwt.fromExtractors` falls through.
 */
export const ADMIN_AREA_PATH_PREFIX = 'admin/';

/**
 * Keyed on URL because passport extracts before Nest resolves the handler, so `@Roles` is invisible
 * here. The spec pins every admin route slug against this pattern.
 */
const ADMIN_AREA_PATH_PATTERN = new RegExp(`^/v\\d+/${ADMIN_AREA_PATH_PREFIX}`);

export function fromAccessTokenCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const tenantToken = cookies?.[ACCESS_TOKEN_COOKIE_NAME];
  const adminToken = cookies?.[ADMIN_ACCESS_TOKEN_COOKIE_NAME];

  return ADMIN_AREA_PATH_PATTERN.test(req.path)
    ? (adminToken ?? tenantToken ?? null)
    : (tenantToken ?? adminToken ?? null);
}
