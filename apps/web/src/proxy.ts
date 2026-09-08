import { type NextRequest, NextResponse } from "next/server";

import { ROUTES } from "@/app/_libs/constants/routes";

/**
 * Matches the backend's SESSION_HINT_COOKIE_NAME (apps/backend/src/api/auth/constants/auth.constants.ts).
 * Presence is only a cheap, approximate "is this visitor logged in" signal for routing — it is
 * NOT a security boundary. The cookie carries no credential at all (its value is the literal
 * "1"), and real authorization is still enforced by the backend on every API call. This exists
 * purely to eliminate the flash of the wrong page's content that a client-side-only redirect
 * (RedirectIfAuthenticated/RequireAuth) can't avoid on a hard navigation — the server decides
 * which page to render before any HTML is ever sent, instead of sending the wrong page and then
 * swapping it out after hydration.
 *
 * Deliberately the session hint rather than either real token, because both are wrong for this:
 * `refresh_token` is scoped to `Path=/v1/auth`, so a browser never sends it on a page request at
 * all; and `access_token` expires after 15 minutes, so keying on it bounced any idle-but-still-
 * refreshable visitor to /login while the client-side guards (reading localStorage) still
 * believed they were signed in — the two disagreeing produced an infinite /login <-> /dashboard
 * redirect loop. The hint lives as long as the refresh token, which is exactly the window in
 * which a session can still be revived, so both sides now agree.
 *
 * Cross-origin is handled by `next.config.ts`'s `/v1/:path*` rewrite: the API is proxied through
 * this app's own origin, so the backend's Set-Cookie is first-party here even when the API is
 * served from a different domain in production.
 */
const SESSION_HINT_COOKIE_NAME = "session";

const REDIRECT_IF_AUTHENTICATED_PATHS: string[] = [
  ROUTES.HOME,
  ROUTES.LOGIN,
  ROUTES.LOGIN_MICROSOFT,
  ROUTES.ONBOARDING_SIGNUP,
  // Reachable only via a `google_pending_signup` cookie, not a session — but an authenticated
  // visitor who lands here anyway (a stale tab, the back button) has nothing left to do: the
  // pending signup it depended on is already consumed the moment a session exists.
  ROUTES.ONBOARDING_BUSINESS_NAME,
];

const REQUIRE_AUTH_PATHS: string[] = [
  ROUTES.DASHBOARD,
  ROUTES.REVIEW_QUEUE,
  ROUTES.SETTINGS,
  ROUTES.SETTINGS_PROMPTS,
  ROUTES.ONBOARDING_CONNECT,
];

export function proxy(request: NextRequest): NextResponse {
  const hasSession = request.cookies.has(SESSION_HINT_COOKIE_NAME);
  const { pathname } = request.nextUrl;

  if (hasSession && REDIRECT_IF_AUTHENTICATED_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL(ROUTES.DASHBOARD, request.url));
  }

  const requiresAuth =
    REQUIRE_AUTH_PATHS.includes(pathname) || pathname.startsWith(`${ROUTES.REVIEW_QUEUE}/`);
  if (!hasSession && requiresAuth) {
    return NextResponse.redirect(new URL(ROUTES.LOGIN, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/login/microsoft",
    "/onboarding/signup",
    "/onboarding/business-name",
    "/onboarding/connect",
    "/dashboard",
    "/review-queue",
    "/review-queue/:path*",
    "/settings",
    "/settings/prompts",
  ],
};
