import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { RequireAuth } from "../require-auth";

// Seeds the non-credential `session` cookie directly, as the backend's `res.cookie("session", ...)` would.
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
    // jsdom rejects assigning `window.location.href`; swap in a settable stand-in to observe the hard redirect.
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

  // Regression: a platform admin on a tenant-only route has a valid session, so it must not count as no-session
  // (which bounces via /login forever); it is a 403 shape, not a 401.
  test("redirects a signed-in platform admin to /forbidden, not /login", async () => {
    setSessionCookie("admin");

    renderGuarded();

    await waitFor(() => expect(window.location.href).toBe("/forbidden"));
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });
});
