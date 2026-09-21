import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { TokenService } from "@/app/_libs/services/token.service";

import { RedirectIfAuthenticated } from "../redirect-if-authenticated";

vi.mock("@/app/_libs/api-sdk/config", () => ({
  refreshSession: vi.fn().mockResolvedValue(false),
  apiConfig: {},
}));

function storeLiveAccessToken(type: "tenant_user" | "platform_admin"): void {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, type }));
  TokenService.setAccessToken(`header.${payload}.signature`);
}

function renderLoginPage() {
  return render(
    <RedirectIfAuthenticated>
      <div>login form</div>
    </RedirectIfAuthenticated>,
  );
}

describe("RedirectIfAuthenticated", () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "http://localhost:3002/login" },
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  test("renders the login form for an anonymous visitor", () => {
    renderLoginPage();

    expect(screen.getByText("login form")).toBeInTheDocument();
    expect(window.location.href).toBe("http://localhost:3002/login");
  });

  test("redirects an already-signed-in tenant user to /dashboard", async () => {
    storeLiveAccessToken("tenant_user");

    renderLoginPage();

    await waitFor(() => expect(window.location.href).toBe("/dashboard"));
  });

  /**
   * Regression: this used to redirect ANY authenticated visitor to /dashboard unconditionally.
   * For a platform admin, that sent them straight into the tenant-only check `RequireAuth`
   * applies to /dashboard, which redirects a wrong-type token to /forbidden — a login page that
   * "helpfully" forwards a signed-in admin into a page that immediately rejects them is not
   * actually helpful, and combined with the OLD proxy.ts behavior (before the session-hint cookie
   * carried which principal, an admin bouncing off /dashboard had no hint at all and landed back
   * on /login) this pairing is exactly what produced the infinite /login <-> /dashboard loop the
   * bug report described. The redirect target has to depend on which kind of session it is.
   */
  test("redirects an already-signed-in platform admin to /admin, not /dashboard", async () => {
    storeLiveAccessToken("platform_admin");

    renderLoginPage();

    await waitFor(() => expect(window.location.href).toBe("/admin"));
  });
});
