import { type NextRequest, NextResponse } from "next/server";

import { ROUTES } from "@/app/_libs/constants/routes";

/**
 * Matches the backend's SESSION_HINT_COOKIE_NAME (apps/backend/src/api/auth/constants/auth.constants.ts).
 * Presence is only a cheap, approximate "is this visitor logged in" signal for routing — it is
 * NOT a security boundary. The cookie carries no credential at all (its value is just which kind
 * of principal, `"tenant"` or `"admin"`), and real authorization is still enforced by the backend
 * on every API call. This exists purely to eliminate the flash of the wrong page's content that a
 * client-side-only redirect (RedirectIfAuthenticated/RequireAuth) can't avoid on a hard
 * navigation — the server decides which page to render before any HTML is ever sent, instead of
 * sending the wrong page and then swapping it out after hydration.
 *
 * Deliberately the session hint rather than either real token, because both are wrong for this:
 * `refresh_token` is scoped to `Path=/v1/auth`, so a browser never sends it on a page request at
 * all; and `access_token` expires after 15 minutes, so keying on it bounced any idle-but-still-
 * refreshable visitor to /login while the client-side guards (reading localStorage) still
 * believed they were signed in — the two disagreeing produced an infinite /login <-> /dashboard
 * redirect loop. The hint lives as long as the underlying session can be revived (the refresh
 * token's lifetime for a tenant; the access token's own lifetime for an admin, who has none to
 * refresh with — see the backend's `setAdminSessionCookies`), so both sides stay in agreement.
 *
 * The VALUE, not just presence, matters just as much: a platform admin and a tenant user are both
 * "signed in," but not for the same set of routes. Before this cookie carried which kind, a
 * platform admin manually navigating to a tenant-only route (or vice versa) had no session hint
 * that matched either list below, `proxy.ts` bounced them to `/login`, and `/login`'s own
 * client-side guard found their still-valid `access_token` in localStorage and bounced them
 * straight back — an infinite loop between two pages that never agreed on the answer, and that
 * never even reached the backend to ask. Checking the value here means a genuine role mismatch is
 * caught at the edge, before either page renders, and sent somewhere that explains why instead of
 * somewhere that disagrees with the next guard down the line.
 *
 * Cross-origin is handled by `next.config.ts`'s `/v1/:path*` rewrite: the API is proxied through
 * this app's own origin, so the backend's Set-Cookie is first-party here even when the API is
 * served from a different domain in production.
 */
const SESSION_HINT_COOKIE_NAME = "session";
const SESSION_HINT_TENANT_VALUE = "tenant";
const SESSION_HINT_ADMIN_VALUE = "admin";

/**
 * MIGRATION SHIM — safe to delete once every cookie issued before the tenant/admin split has
 * expired (the tenant hint's own `REFRESH_TOKEN_TTL_SECONDS`, 7 days, from the deploy that ships
 * this).
 *
 * The hint's value used to be the literal "1" for every principal. Treating that as "no session"
 * would log out every already-signed-in tenant the instant this deploys — and not cleanly: their
 * localStorage token is still valid, so `/dashboard` would redirect here to `/login`, whose
 * client-side guard would read that valid token and hard-redirect straight back to `/dashboard`,
 * looping until the access token expires up to 15 minutes later. That is precisely the loop this
 * whole cookie exists to prevent, so the old value has to keep meaning what it used to mean:
 * only tenants could hold it, since the admin login path cleared this cookie outright back then.
 */
const SESSION_HINT_LEGACY_TENANT_VALUE = "1";

const REDIRECT_IF_AUTHENTICATED_PATHS: string[] = [
  ROUTES.HOME,
  ROUTES.LOGIN,
  ROUTES.LOGIN_MICROSOFT,
  ROUTES.ADMIN_LOGIN,
  ROUTES.ONBOARDING_SIGNUP,
  // Reachable only via a `google_pending_signup` cookie, not a session — but an authenticated
  // visitor who lands here anyway (a stale tab, the back button) has nothing left to do: the
  // pending signup it depended on is already consumed the moment a session exists.
  ROUTES.ONBOARDING_BUSINESS_NAME,
];

const REQUIRE_TENANT_AUTH_PATHS: string[] = [
  ROUTES.DASHBOARD,
  ROUTES.REVIEW_QUEUE,
  ROUTES.SETTINGS,
  ROUTES.SETTINGS_PROMPTS,
  ROUTES.ONBOARDING_CONNECT,
];

/** `/admin` itself plus every nested admin screen — `pathname.startsWith` below covers the rest. */
const ADMIN_ROOT_PATH = ROUTES.ADMIN;

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
    // Sent to the home that actually belongs to this principal, not a fixed destination — an
    // admin redirected to `/dashboard` here would just immediately fail the tenant-only check
    // below and bounce right back to `/login`, recreating the loop this cookie exists to prevent.
    return NextResponse.redirect(
      new URL(isAdminSession ? ROUTES.ADMIN : ROUTES.DASHBOARD, request.url)
    );
  }

  const requiresTenantAuth =
    REQUIRE_TENANT_AUTH_PATHS.includes(pathname) ||
    pathname.startsWith(`${ROUTES.REVIEW_QUEUE}/`);
  if (requiresTenantAuth) {
    if (isAdminSession) {
      // A real session, just not one that belongs here — a 403-shaped answer, not a bounce to a
      // login screen this visitor is already signed in past.
      return NextResponse.redirect(new URL(ROUTES.FORBIDDEN, request.url));
    }
    if (!isTenantSession) {
      return NextResponse.redirect(new URL(ROUTES.LOGIN, request.url));
    }
  }

  const requiresAdminAuth = pathname === ADMIN_ROOT_PATH || pathname.startsWith(`${ADMIN_ROOT_PATH}/`);
  if (requiresAdminAuth) {
    if (isTenantSession) {
      return NextResponse.redirect(new URL(ROUTES.FORBIDDEN, request.url));
    }
    if (!isAdminSession) {
      // The admin's own sign-in screen, not the tenant `/login` — since the split, that screen has
      // no admin path left on it at all, so bouncing an unauthenticated admin-area visitor there
      // was a dead end with no way to actually sign in.
      return NextResponse.redirect(new URL(ROUTES.ADMIN_LOGIN, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/login/microsoft",
    "/admin-login",
    "/onboarding/signup",
    "/onboarding/business-name",
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
