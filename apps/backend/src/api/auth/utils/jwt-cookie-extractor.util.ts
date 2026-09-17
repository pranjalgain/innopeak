import type { Request } from 'express';

import {
  ACCESS_TOKEN_COOKIE_NAME,
  ADMIN_ACCESS_TOKEN_COOKIE_NAME,
} from '../constants/auth.constants';

/**
 * `passport-jwt` extractor: pulls the access token out of whichever principal's httpOnly cookie is
 * present — the tenant `access_token` or the platform-admin `admin_access_token` (see
 * `ADMIN_ACCESS_TOKEN_COOKIE_NAME`'s own comment for why the two are separate cookie names). The
 * JWT's own `type` claim (checked by `JwtStrategy.validate`) is what actually decides who the
 * caller is, not which cookie carried it — but which cookie is *tried first* still matters, because
 * a browser can legitimately carry both at once. Giving admin sessions their own cookie name was
 * specifically so a tenant owner and a platform admin signed in from the same browser don't clobber
 * each other (see `separate-admin-login-design.md`) — and once both cookies can be present
 * simultaneously, a fixed preference order breaks one principal's admin-area requests the moment
 * the other is also signed in: preferring `access_token` unconditionally 403'd every admin-route
 * request from a browser that also held a live tenant session, since the tenant JWT never satisfies
 * `@Roles(PLATFORM_ADMIN)`.
 *
 * Route-aware instead: an admin-area request (`/v{n}/admin/...`) tries `admin_access_token` first,
 * anything else tries `access_token` first — either way falling back to the other cookie if the
 * preferred one is absent, so a browser that only ever holds one cookie behaves exactly as before.
 *
 * Requires `cookie-parser` to already be registered (`bootstrap.ts`) so `req.cookies` exists;
 * returns null (not throws) when neither is present so `ExtractJwt.fromExtractors` can fall
 * through to the next extractor.
 */
export const ADMIN_AREA_PATH_PREFIX = 'admin/';

/**
 * Matches `/v{n}/admin/...`. Deliberately keyed on the URL rather than on the route's `@Roles`
 * metadata, which passport cannot see this early — extraction happens before Nest resolves the
 * handler. That coupling is the fragile part: an admin-only controller mounted outside
 * `RouteNames.ADMIN_*` would silently resolve as the *tenant* principal for any browser holding
 * both cookies, and fail closed with a confusing 403 rather than anything that points here.
 * `jwt-cookie-extractor.util.spec.ts` pins every admin route slug against this pattern so adding
 * one somewhere else breaks a test instead of a login.
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
