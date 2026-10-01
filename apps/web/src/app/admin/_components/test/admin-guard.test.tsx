import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AdminGuard } from "../admin-guard";

/**
 * `AdminGuard`/`useAuthToken` read the non-credential `session` cookie the backend sets on every
 * sign-in (see `TokenService.getTokenType`'s own doc comment) — seeding it directly here is the
 * jsdom equivalent of the backend's `res.cookie("session", ...)`.
 */
function setSessionCookie(value: "tenant" | "admin" | null): void {
  document.cookie =
    value === null
      ? "session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"
      : `session=${value}; path=/`;
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
    setSessionCookie(null);
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
    setSessionCookie(null);
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  test("redirects to /login and renders nothing with no session at all", async () => {
    renderGuard();

    await waitFor(() => expect(window.location.href).toBe("/login"));
    expect(screen.queryByText("admin content")).not.toBeInTheDocument();
  });

  /**
   * Regression: a real, valid tenant-user session manually visiting /admin used to fall into the
   * same "not allowed" branch as no session at all, and got sent to /login — where an
   * authenticated visitor's own session would then try to bounce them right back to a page they're
   * not allowed on. A wrong-type-but-valid session is a 403 shape, not a 401 shape.
   */
  test("redirects a signed-in tenant user to /forbidden, not /login", async () => {
    setSessionCookie("tenant");

    renderGuard();

    await waitFor(() => expect(window.location.href).toBe("/forbidden"));
    expect(screen.queryByText("admin content")).not.toBeInTheDocument();
  });

  /**
   * Regression: an admin who accepts their invite through Google arrives from a server-side
   * redirect with no JSON body for any client JS to read. That used to leave `localStorage` empty
   * and hand this case to a separate network probe; the `session` cookie the backend already sets
   * on that same redirect answers it directly instead, no probe needed.
   */
  test("renders children without redirecting for a live platform-admin session", async () => {
    setSessionCookie("admin");

    renderGuard();

    expect(await screen.findByText("admin content")).toBeInTheDocument();
    expect(window.location.href).toBe("http://localhost:3002/admin");
  });
});
