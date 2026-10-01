import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { RequireAuth } from "../require-auth";

/**
 * `RequireAuth`/`useAuthToken` read the non-credential `session` cookie the backend sets on every
 * sign-in (see `TokenService.getTokenType`'s own doc comment) — seeding it directly here is the
 * jsdom equivalent of the backend's `res.cookie("session", ...)`.
 */
function setSessionCookie(value: "tenant" | "admin" | null): void {
  document.cookie =
    value === null
      ? "session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"
      : `session=${value}; path=/`;
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
    setSessionCookie(null);
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
    setSessionCookie(null);
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  test("redirects to /login with no session at all", async () => {
    renderGuarded();

    await waitFor(() => expect(window.location.href).toBe("/login"));
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });

  test("renders children for a live tenant-user session", async () => {
    setSessionCookie("tenant");

    renderGuarded();

    expect(await screen.findByText("protected content")).toBeInTheDocument();
    expect(window.location.href).toBe("http://localhost:3002/dashboard");
  });

  /**
   * Regression: this is the exact bug report. A platform admin manually navigating to a
   * tenant-only route had a real, valid session — so this must NOT be treated as "no session"
   * (which redirects to /login, where the admin's own still-valid session would try to bounce them
   * right back here, forever). A valid-but-wrong-type session is a 403 shape, not a 401 shape.
   */
  test("redirects a signed-in platform admin to /forbidden, not /login", async () => {
    setSessionCookie("admin");

    renderGuarded();

    await waitFor(() => expect(window.location.href).toBe("/forbidden"));
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });
});
