import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { TokenService } from "@/app/_libs/services/token.service";

import { AdminGuard } from "../admin-guard";

// `useAuthToken` falls back to a `/v1/auth/refresh` round trip whenever localStorage holds no
// usable token. Stubbed to "no session" so the token half of the guard is decided locally and
// these tests never depend on a backend.
vi.mock("@/app/_libs/api-sdk/config", () => ({
  refreshSession: vi.fn().mockResolvedValue(false),
  apiConfig: {},
}));

/**
 * A far-future JWT carrying a real `type` claim — `AdminGuard` reads this instead of the old mock
 * `SessionService` role string (since deleted), since that flag could desync from the actual
 * signed-in principal (nothing kept it in sync with a token revived via refresh).
 */
function storeLiveAccessToken(type: "tenant_user" | "platform_admin"): void {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, type }));
  TokenService.setAccessToken(`header.${payload}.signature`);
}

function renderGuard() {
  return render(
    <AdminGuard>
      <div>admin content</div>
    </AdminGuard>,
  );
}

describe("AdminGuard", () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    // jsdom's `window.location` doesn't support a plain assignment to `.href` the way a real
    // browser does inside a test environment — replaced with a settable stand-in so the guard's
    // `window.location.href = ...` (a real hard redirect, not router.replace() — see the
    // component's own doc comment for why) can be observed directly.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "http://localhost:3002/admin" },
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  test("redirects to /login and renders nothing with no session at all", async () => {
    renderGuard();

    await waitFor(() => expect(window.location.href).toBe("/login"));
    expect(screen.queryByText("admin content")).not.toBeInTheDocument();
  });

  /**
   * Regression: a real, valid tenant-user token manually visiting /admin used to fall into the
   * same "not allowed" branch as no token at all, and got sent to /login — where an authenticated
   * visitor's own token would then try to bounce them right back to a page they're not allowed
   * on. A wrong-type-but-valid token is a 403 shape, not a 401 shape.
   */
  test("redirects a signed-in tenant user to /forbidden, not /login", async () => {
    storeLiveAccessToken("tenant_user");

    renderGuard();

    await waitFor(() => expect(window.location.href).toBe("/forbidden"));
    expect(screen.queryByText("admin content")).not.toBeInTheDocument();
  });

  /**
   * A valid, unexpired token whose `type` claim can't be read is not evidence of admin access —
   * but it isn't "signed out" either, and treating it as such looped: `/login` is in `proxy.ts`'s
   * matcher, so a still-live admin session hint bounced it back to `/admin` and around again,
   * with no API call anywhere in the cycle to clear that cookie. Anything signed-in but not
   * provably an admin has to land on `/forbidden`, which isn't matched and so always renders.
   */
  test("sends a signed-in token with an unreadable type to /forbidden, never /login", async () => {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    TokenService.setAccessToken(`header.${payload}.signature`);

    renderGuard();

    await waitFor(() => expect(window.location.href).toBe("/forbidden"));
    expect(screen.queryByText("admin content")).not.toBeInTheDocument();
  });

  test("renders children without redirecting for a live platform-admin session", async () => {
    storeLiveAccessToken("platform_admin");

    renderGuard();

    expect(await screen.findByText("admin content")).toBeInTheDocument();
    expect(window.location.href).toBe("http://localhost:3002/admin");
  });
});
