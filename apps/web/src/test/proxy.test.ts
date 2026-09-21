import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";

import { ROUTES } from "@/app/_libs/constants/routes";
import { proxy } from "@/proxy";

function requestFor(pathname: string, sessionValue?: string): NextRequest {
  const headers = new Headers();
  if (sessionValue !== undefined) {
    headers.set("cookie", `session=${sessionValue}`);
  }
  return new NextRequest(new URL(pathname, "http://localhost:3002"), { headers });
}

function redirectLocation(response: ReturnType<typeof proxy>): string | null {
  const location = response.headers.get("location");
  if (!location) return null;
  return new URL(location).pathname;
}

describe("proxy — tenant vs admin session routing", () => {
  /**
   * The bug this file exists to pin down: a platform admin manually navigating to a tenant-only
   * route used to have no session-hint cookie at all (the admin login path cleared it outright),
   * so this exact case fell into the same branch as a fully signed-out visitor — redirected to
   * `/login` — where the client-side guard found the admin's still-valid `access_token` in
   * localStorage and bounced straight back, forever. An `admin`-valued cookie must now be
   * distinguished from "no cookie" and sent to `/forbidden`, not `/login`.
   */
  test("an admin session hitting a tenant-only route is sent to /forbidden, not /login", () => {
    const response = proxy(requestFor(ROUTES.DASHBOARD, "admin"));
    expect(redirectLocation(response)).toBe(ROUTES.FORBIDDEN);
  });

  test("a tenant session hitting an admin-only route is sent to /forbidden, not /login", () => {
    const response = proxy(requestFor(ROUTES.ADMIN, "tenant"));
    expect(redirectLocation(response)).toBe(ROUTES.FORBIDDEN);
  });

  test("a tenant session hitting an admin sub-route is also sent to /forbidden", () => {
    const response = proxy(requestFor(ROUTES.ADMIN_USERS, "tenant"));
    expect(redirectLocation(response)).toBe(ROUTES.FORBIDDEN);
  });

  test("no session at all on a tenant-only route goes to /login", () => {
    const response = proxy(requestFor(ROUTES.DASHBOARD));
    expect(redirectLocation(response)).toBe(ROUTES.LOGIN);
  });

  /**
   * Not `/login` — that screen has no admin path left on it since the split
   * (`separate-admin-login-design.md`), so bouncing an unauthenticated admin-area visitor there
   * would be a dead end with no way to actually sign in.
   */
  test("no session at all on an admin-only route goes to /admin-login", () => {
    const response = proxy(requestFor(ROUTES.ADMIN));
    expect(redirectLocation(response)).toBe(ROUTES.ADMIN_LOGIN);
  });

  test("a tenant session on a tenant-only route passes through", () => {
    const response = proxy(requestFor(ROUTES.DASHBOARD, "tenant"));
    expect(redirectLocation(response)).toBeNull();
  });

  test("an admin session on an admin-only route passes through", () => {
    const response = proxy(requestFor(ROUTES.ADMIN, "admin"));
    expect(redirectLocation(response)).toBeNull();
  });

  /**
   * The other half of the loop: `/login` used to redirect ANY signed-in visitor straight to
   * `/dashboard`, which for an admin session immediately failed the tenant-only check above and
   * bounced right back to `/login` — recreating the same infinite loop one hop later. The
   * redirect target has to depend on which kind of session it is.
   */
  test("an admin session landing on /login is sent to /admin, not /dashboard", () => {
    const response = proxy(requestFor(ROUTES.LOGIN, "admin"));
    expect(redirectLocation(response)).toBe(ROUTES.ADMIN);
  });

  test("a tenant session landing on /login is sent to /dashboard", () => {
    const response = proxy(requestFor(ROUTES.LOGIN, "tenant"));
    expect(redirectLocation(response)).toBe(ROUTES.DASHBOARD);
  });

  test("no session on /login passes through and renders the login page", () => {
    const response = proxy(requestFor(ROUTES.LOGIN));
    expect(redirectLocation(response)).toBeNull();
  });

  test("an admin session landing on /admin-login is sent to /admin, not /dashboard", () => {
    const response = proxy(requestFor(ROUTES.ADMIN_LOGIN, "admin"));
    expect(redirectLocation(response)).toBe(ROUTES.ADMIN);
  });

  test("a tenant session landing on /admin-login is sent to /dashboard", () => {
    const response = proxy(requestFor(ROUTES.ADMIN_LOGIN, "tenant"));
    expect(redirectLocation(response)).toBe(ROUTES.DASHBOARD);
  });

  test("no session on /admin-login passes through and renders the admin login page", () => {
    const response = proxy(requestFor(ROUTES.ADMIN_LOGIN));
    expect(redirectLocation(response)).toBeNull();
  });

  /**
   * Deploy-time regression: the hint's value used to be the literal "1" for everyone, and only a
   * tenant could hold it (the admin path cleared the cookie outright back then). Every browser
   * already signed in when this ships still carries it, with the refresh token's 7-day lifetime.
   * Reading it as "no session" would bounce those tenants to `/login`, where their still-valid
   * localStorage token hard-redirects them back to `/dashboard` — the exact loop this cookie
   * exists to prevent, re-created for every existing user at once.
   */
  test("a legacy `1` session cookie is still honoured as a tenant session", () => {
    expect(redirectLocation(proxy(requestFor(ROUTES.DASHBOARD, "1")))).toBeNull();
    expect(redirectLocation(proxy(requestFor(ROUTES.LOGIN, "1")))).toBe(ROUTES.DASHBOARD);
    // ...and still isn't mistaken for an admin one.
    expect(redirectLocation(proxy(requestFor(ROUTES.ADMIN, "1")))).toBe(ROUTES.FORBIDDEN);
  });

  test("an unrecognized cookie value is treated as no session, not as either role", () => {
    // Defensive: a malformed/stale cookie value must fail closed to "signed out", never be
    // mistaken for a match against either the tenant or admin branch.
    const response = proxy(requestFor(ROUTES.DASHBOARD, "garbage"));
    expect(redirectLocation(response)).toBe(ROUTES.LOGIN);
  });
});
