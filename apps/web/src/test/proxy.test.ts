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
  // Regression: admins used to land in the /login <-> localStorage-token redirect loop.
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

  // Not `/login`: it has no admin sign-in path, so that would be a dead end.
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

  // Regression: redirecting any signed-in visitor to /dashboard re-created the loop for admins one hop later.
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

  // Deploy-time regression: sessions signed in before the role-valued cookie still carry the literal "1"; treating it as no session would loop every existing tenant.
  test("a legacy `1` session cookie is still honoured as a tenant session", () => {
    expect(redirectLocation(proxy(requestFor(ROUTES.DASHBOARD, "1")))).toBeNull();
    expect(redirectLocation(proxy(requestFor(ROUTES.LOGIN, "1")))).toBe(ROUTES.DASHBOARD);
    // ...and still isn't mistaken for an admin one.
    expect(redirectLocation(proxy(requestFor(ROUTES.ADMIN, "1")))).toBe(ROUTES.FORBIDDEN);
  });

  test("an unrecognized cookie value is treated as no session, not as either role", () => {
    // Fails closed to "signed out".
    const response = proxy(requestFor(ROUTES.DASHBOARD, "garbage"));
    expect(redirectLocation(response)).toBe(ROUTES.LOGIN);
  });
});
