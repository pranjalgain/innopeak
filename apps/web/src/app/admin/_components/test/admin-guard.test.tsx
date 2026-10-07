import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AdminGuard } from "../admin-guard";

// Seeds the non-credential `session` cookie the backend sets on every sign-in.
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
    // jsdom's `window.location.href` can't be assigned like a browser's; a settable stand-in lets the guard's hard redirect be observed.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "http://localhost:3002/admin" },
    });
  });

  afterEach(() => {
    setSessionCookie(null);
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  test("redirects to /admin-login and renders nothing with no session at all", async () => {
    renderGuard();

    await waitFor(() => expect(window.location.href).toBe("/admin-login"));
    expect(screen.queryByText("admin content")).not.toBeInTheDocument();
  });

  // Regression: a valid tenant session was sent to /login like no session, then bounced back; a wrong-type session is a 403, not a 401.
  test("redirects a signed-in tenant user to /forbidden, not /login", async () => {
    setSessionCookie("tenant");

    renderGuard();

    await waitFor(() => expect(window.location.href).toBe("/forbidden"));
    expect(screen.queryByText("admin content")).not.toBeInTheDocument();
  });

  // Regression: a Google invite acceptance arrives via server redirect with no JSON body, so only the `session` cookie can identify the admin.
  test("renders children without redirecting for a live platform-admin session", async () => {
    setSessionCookie("admin");

    renderGuard();

    expect(await screen.findByText("admin content")).toBeInTheDocument();
    expect(window.location.href).toBe("http://localhost:3002/admin");
  });
});
