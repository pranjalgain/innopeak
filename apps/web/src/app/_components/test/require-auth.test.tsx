import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { TokenService } from "@/app/_libs/services/token.service";

import { RequireAuth } from "../require-auth";

// `useAuthToken`'s revive path (`reviveMissing: true` here) falls back to a `/v1/auth/refresh`
// round trip whenever localStorage holds no usable token. Stubbed so these tests never depend on
// a backend and the token check resolves from localStorage alone.
vi.mock("@/app/_libs/api-sdk/config", () => ({
  refreshSession: vi.fn().mockResolvedValue(false),
  apiConfig: {},
}));

function storeLiveAccessToken(type: "tenant_user" | "platform_admin"): void {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, type }));
  TokenService.setAccessToken(`header.${payload}.signature`);
}

function renderGuarded() {
  return render(
    <RequireAuth>
      <div>protected content</div>
    </RequireAuth>,
  );
}

describe("RequireAuth", () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    // jsdom doesn't support a plain assignment to `window.location.href` the way a real browser
    // does — replaced with a settable stand-in so the component's hard redirect (deliberately
    // `window.location.href`, not `router.replace()` — see its own doc comment) can be observed.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "http://localhost:3002/dashboard" },
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  test("redirects to /login with no token at all", async () => {
    renderGuarded();

    await waitFor(() => expect(window.location.href).toBe("/login"));
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });

  test("renders children for a live tenant-user token", async () => {
    storeLiveAccessToken("tenant_user");

    renderGuarded();

    expect(await screen.findByText("protected content")).toBeInTheDocument();
    expect(window.location.href).toBe("http://localhost:3002/dashboard");
  });

  /**
   * Regression: this is the exact bug report. A platform admin manually navigating to a
   * tenant-only route had a real, valid token — so this must NOT be treated as "no token" (which
   * redirects to /login, where the admin's own still-valid token would try to bounce them right
   * back here, forever). A valid-but-wrong-type token is a 403 shape, not a 401 shape.
   */
  test("redirects a signed-in platform admin to /forbidden, not /login", async () => {
    storeLiveAccessToken("platform_admin");

    renderGuarded();

    await waitFor(() => expect(window.location.href).toBe("/forbidden"));
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });
});
