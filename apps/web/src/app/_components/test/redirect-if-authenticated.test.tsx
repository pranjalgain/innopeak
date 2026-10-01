import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { RedirectIfAuthenticated } from "../redirect-if-authenticated";

/**
 * `RedirectIfAuthenticated`/`useAuthToken` read the non-credential `session` cookie the backend
 * sets on every sign-in (see `TokenService.getTokenType`'s own doc comment) — seeding it directly
 * here is the jsdom equivalent of the backend's `res.cookie("session", ...)`.
 */
function setSessionCookie(value: "tenant" | "admin" | null): void {
  document.cookie =
    value === null
      ? "session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"
      : `session=${value}; path=/`;
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
    setSessionCookie(null);
    originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "http://localhost:3002/login" },
    });
  });

  afterEach(() => {
    setSessionCookie(null);
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  test("renders the login form for an anonymous visitor", () => {
    renderLoginPage();

    expect(screen.getByText("login form")).toBeInTheDocument();
    expect(window.location.href).toBe("http://localhost:3002/login");
  });

  test("redirects an already-signed-in tenant user to /dashboard", async () => {
    setSessionCookie("tenant");

    renderLoginPage();

    await waitFor(() => expect(window.location.href).toBe("/dashboard"));
  });

  /**
   * Regression: this used to redirect ANY authenticated visitor to /dashboard unconditionally.
   * For a platform admin, that sent them straight into the tenant-only check `RequireAuth`
   * applies to /dashboard, which redirects a wrong-type session to /forbidden — a login page that
   * "helpfully" forwards a signed-in admin into a page that immediately rejects them is not
   * actually helpful, and combined with the OLD proxy.ts behavior (before the session-hint cookie
   * carried which principal, an admin bouncing off /dashboard had no hint at all and landed back
   * on /login) this pairing is exactly what produced the infinite /login <-> /dashboard loop the
   * bug report described. The redirect target has to depend on which kind of session it is.
   */
  test("redirects an already-signed-in platform admin to /admin, not /dashboard", async () => {
    setSessionCookie("admin");

    renderLoginPage();

    await waitFor(() => expect(window.location.href).toBe("/admin"));
  });
});
