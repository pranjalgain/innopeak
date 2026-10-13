import { type NextRequest, NextResponse } from "next/server";

import { ROUTES } from "@/app/_libs/constants/routes";
import {
  POST_LOGIN_REDIRECT_PARAM,
  returnPathFor,
  safeAdminReturnPath,
  safeTenantReturnPath,
} from "@/app/_libs/utils/post-login-redirect";

/**
 * Matches the backend's SESSION_HINT_COOKIE_NAME. A cheap, approximate "is this visitor logged in"
 * signal for server-side routing, NOT a security boundary: it carries no credential (the value is
 * only `"tenant"` or `"admin"`), and the backend authorizes every API call. It lets the server pick
 * the right page before any HTML is sent, avoiding the flash a client-side redirect can't avoid.
 *
 * Deliberately not either real token: `refresh_token` is scoped to `Path=/v1/auth`, so the browser
 * never sends it on page requests, and `access_token` expires after 15 minutes, which bounced idle
 * but still-refreshable visitors to /login while the client guards (reading localStorage) still saw
 * them signed in: an infinite /login <-> /dashboard loop. The hint lives as long as the session can
 * be revived (the backend's `setAdminSessionCookies` for admins, who have no refresh token).
 *
 * The value matters, not just presence: a role mismatch (admin on a tenant route or vice versa)
 * must be caught here and sent somewhere that explains it, or `/login`'s client guard finds the
 * still-valid `access_token` and bounces them straight back, looping.
 *
 * Cross-origin: `next.config.ts`'s `/v1/:path*` rewrite proxies the API through this origin, so the
 * backend's Set-Cookie is first-party even when the API is on another domain in production.
 */
const SESSION_HINT_COOKIE_NAME = "session";
const SESSION_HINT_TENANT_VALUE = "tenant";
const SESSION_HINT_ADMIN_VALUE = "admin";

/**
 * MIGRATION SHIM: safe to delete once every cookie issued before the tenant/admin split has expired
 * (the tenant hint's `REFRESH_TOKEN_TTL_SECONDS`, 7 days, after deploy).
 *
 * The hint used to be the literal "1" for every principal. Treating it as "no session" would log
 * out signed-in tenants and trigger the /login <-> /dashboard loop this cookie exists to prevent, so
 * it keeps meaning "tenant" (admins couldn't hold it back then).
 */
const SESSION_HINT_LEGACY_TENANT_VALUE = "1";

const REDIRECT_IF_AUTHENTICATED_PATHS: string[] = [
  ROUTES.HOME,
  ROUTES.LOGIN,
  ROUTES.ADMIN_LOGIN,
  ROUTES.ONBOARDING_SIGNUP,
  // Reachable only via a `sso_pending_signup` cookie, but a signed-in visitor landing here (stale
  // tab, back button) has nothing left to do: the pending signup is consumed once a session exists.
  ROUTES.ONBOARDING_BUSINESS_NAME,
];

const REQUIRE_TENANT_AUTH_PATHS: string[] = [
  ROUTES.DASHBOARD,
  ROUTES.REVIEW_QUEUE,
  ROUTES.SETTINGS,
  ROUTES.SETTINGS_PROMPTS,
  ROUTES.ONBOARDING_PLAN,
  ROUTES.ONBOARDING_CONNECT,
];

/** `/admin` itself; `pathname.startsWith` covers nested screens. */
const ADMIN_ROOT_PATH = ROUTES.ADMIN;

/** A sign-in URL that remembers where the visitor was headed, so signing in lands there instead of on the home screen. */
function loginUrl(request: NextRequest, loginPath: string, returnTo: string | null): URL {
  const url = new URL(loginPath, request.url);
  if (returnTo) url.searchParams.set(POST_LOGIN_REDIRECT_PARAM, returnTo);
  return url;
}

export function proxy(request: NextRequest): NextResponse {
  const sessionKind = request.cookies.get(SESSION_HINT_COOKIE_NAME)?.value;
  const isTenantSession =
    sessionKind === SESSION_HINT_TENANT_VALUE || sessionKind === SESSION_HINT_LEGACY_TENANT_VALUE;
  const isAdminSession = sessionKind === SESSION_HINT_ADMIN_VALUE;
  const { pathname } = request.nextUrl;

  if (
    (isTenantSession || isAdminSession) &&
    REDIRECT_IF_AUTHENTICATED_PATHS.includes(pathname)
  ) {
    // Sent to this principal's own home: an admin sent to `/dashboard` would fail the tenant-only
    // check below and bounce back to `/login`, recreating the loop. A `?next=` the sign-in redirect left behind wins
    // over home when it is safe for this kind of principal: the login screen refreshes the router right after
    // signing in, and that refresh arrives here as an already-signed-in visit to `/login?next=…`.
    const requestedNext = request.nextUrl.searchParams.get(POST_LOGIN_REDIRECT_PARAM);
    const returnTo = isAdminSession
      ? safeAdminReturnPath(requestedNext)
      : safeTenantReturnPath(requestedNext);
    const home = isAdminSession ? ROUTES.ADMIN : ROUTES.DASHBOARD;
    return NextResponse.redirect(new URL(returnTo ?? home, request.url));
  }

  const requiresTenantAuth =
    REQUIRE_TENANT_AUTH_PATHS.includes(pathname) ||
    pathname.startsWith(`${ROUTES.REVIEW_QUEUE}/`);
  if (requiresTenantAuth) {
    if (isAdminSession) {
      // A real session that doesn't belong here: 403-shaped, not a bounce to a login it's already past.
      return NextResponse.redirect(new URL(ROUTES.FORBIDDEN, request.url));
    }
    if (!isTenantSession) {
      return NextResponse.redirect(
        loginUrl(request, ROUTES.LOGIN, returnPathFor(pathname, request.nextUrl.search, "tenant")),
      );
    }
  }

  const requiresAdminAuth = pathname === ADMIN_ROOT_PATH || pathname.startsWith(`${ADMIN_ROOT_PATH}/`);
  if (requiresAdminAuth) {
    if (isTenantSession) {
      return NextResponse.redirect(new URL(ROUTES.FORBIDDEN, request.url));
    }
    if (!isAdminSession) {
      // The admin sign-in screen, not tenant `/login`, which has no admin path left (a dead end).
      return NextResponse.redirect(
        loginUrl(
          request,
          ROUTES.ADMIN_LOGIN,
          returnPathFor(pathname, request.nextUrl.search, "admin"),
        ),
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/admin-login",
    "/onboarding/signup",
    "/onboarding/business-name",
    "/onboarding/plan",
    "/onboarding/connect",
    "/dashboard",
    "/review-queue",
    "/review-queue/:path*",
    "/settings",
    "/settings/prompts",
    "/admin",
    "/admin/:path*",
  ],
};
