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

function redirectTarget(response: ReturnType<typeof proxy>): URL | null {
  const location = response.headers.get("location");
  return location ? new URL(location) : null;
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

describe("proxy — returning to the page you were headed for", () => {
  test("a signed-out visit to a tenant page is sent to /login with that page as `next`", () => {
    const target = redirectTarget(proxy(requestFor("/review-queue?status=new&page=2")));
    expect(target?.pathname).toBe(ROUTES.LOGIN);
    expect(target?.searchParams.get("next")).toBe("/review-queue?status=new&page=2");
  });

  test("a review detail link keeps its id", () => {
    const target = redirectTarget(proxy(requestFor("/review-queue/abc-123")));
    expect(target?.searchParams.get("next")).toBe("/review-queue/abc-123");
  });

  test("a signed-out visit to an admin page is sent to /admin-login with that page as `next`", () => {
    const target = redirectTarget(proxy(requestFor("/admin/businesses?page=2")));
    expect(target?.pathname).toBe(ROUTES.ADMIN_LOGIN);
    expect(target?.searchParams.get("next")).toBe("/admin/businesses?page=2");
  });

  test("onboarding steps are not remembered: where they lead depends on account state", () => {
    const target = redirectTarget(proxy(requestFor(ROUTES.ONBOARDING_PLAN)));
    expect(target?.pathname).toBe(ROUTES.LOGIN);
    expect(target?.searchParams.has("next")).toBe(false);
  });

  // The login screen refreshes the router right after signing in; that refresh is an already-signed-in visit to
  // `/login?next=…` and must not override the destination with the default home.
  test("a signed-in tenant landing on /login keeps a safe `next` as the destination", () => {
    const target = redirectTarget(proxy(requestFor("/login?next=%2Freview-queue%3Fpage%3D2", "tenant")));
    expect(target?.pathname).toBe("/review-queue");
    expect(target?.search).toBe("?page=2");
  });

  test("a signed-in admin landing on /admin-login keeps a safe admin `next`", () => {
    const target = redirectTarget(proxy(requestFor("/admin-login?next=%2Fadmin%2Fusers", "admin")));
    expect(target?.pathname).toBe("/admin/users");
  });

  test.each([
    ["tenant", "/login?next=%2F%2Fevil.example"],
    ["tenant", "/login?next=https%3A%2F%2Fevil.example"],
    ["tenant", "/login?next=%2Fadmin"],
    ["admin", "/admin-login?next=%2Fdashboard"],
  ])("a %s session ignores an unsafe or foreign `next` (%s) and goes home", (session, path) => {
    const target = redirectTarget(proxy(requestFor(path, session)));
    expect(target?.pathname).toBe(session === "admin" ? ROUTES.ADMIN : ROUTES.DASHBOARD);
    expect(target?.hostname).toBe("localhost");
  });
});

describe("proxy — Content-Security-Policy", () => {
  const pass = (pathname: string) => proxy(requestFor(pathname));

  test("a page response carries a policy whose nonce is the one handed to the layout", () => {
    const response = pass("/login");
    const policy = response.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];

    expect(nonce).toBeTruthy();
    // The request override is how Next learns the nonce, and how the root layout reads `x-nonce`.
    expect(response.headers.get("x-middleware-override-headers")).toContain("x-nonce");
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
  });

  test("every request gets its own nonce", () => {
    const first = pass("/login").headers.get("content-security-policy");
    const second = pass("/login").headers.get("content-security-policy");
    expect(first).not.toBe(second);
  });

  test("a redirect carries no policy: there is no document to protect", () => {
    const response = proxy(requestFor(ROUTES.DASHBOARD));
    expect(response.headers.get("location")).not.toBeNull();
    expect(response.headers.get("content-security-policy")).toBeNull();
  });
});

describe("proxy — a path typed with a trailing slash", () => {
  // `skipTrailingSlashRedirect` keeps `/dashboard/` as typed, and it used to miss every exact-path rule: a signed-out visitor was not
  // redirected here, so the client-side guard sent them to a bare /login and the return path was lost.
  test.each([`${ROUTES.DASHBOARD}/`, `${ROUTES.SETTINGS}/`, `${ROUTES.SETTINGS_PROMPTS}/`])(
    "%s without a session goes to /login and remembers where it was headed",
    (path) => {
      const target = redirectTarget(proxy(requestFor(path)));

      expect(target?.pathname).toBe(ROUTES.LOGIN);
      expect(target?.searchParams.get("next")).toBe(path.replace(/\/$/, ""));
    },
  );

  test("a signed-in visitor to /login/ is sent home like one on /login", () => {
    expect(redirectLocation(proxy(requestFor(`${ROUTES.LOGIN}/`, "tenant")))).toBe(ROUTES.DASHBOARD);
  });
});
