import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useAuthToken } from "@/hooks/auth/use-auth-token";

import { useAdminGuard } from "../use-admin-guard";

vi.mock("@/hooks/auth/use-auth-token", () => ({ useAuthToken: vi.fn() }));

describe("useAdminGuard", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "http://localhost/admin/billing" },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  test("a platform admin is allowed and not redirected", () => {
    vi.mocked(useAuthToken).mockReturnValue({ hasToken: true, tokenType: "platform_admin" });

    const { result } = renderHook(() => useAdminGuard());

    expect(result.current.isAllowed).toBe(true);
    expect(window.location.href).toBe("http://localhost/admin/billing");
  });

  /** Regression: after signing out, Back landed an admin on the *tenant* sign-in page. */
  test("no session at all goes to the admin sign-in, not the tenant one", () => {
    vi.mocked(useAuthToken).mockReturnValue({ hasToken: false, tokenType: null });

    renderHook(() => useAdminGuard());

    expect(window.location.href).toBe("/admin-login");
  });

  test("a tenant session under an admin route is forbidden, not sent to a sign-in page", () => {
    vi.mocked(useAuthToken).mockReturnValue({ hasToken: true, tokenType: "tenant_user" });

    renderHook(() => useAdminGuard());

    expect(window.location.href).toBe("/forbidden");
  });

  test("does nothing while the session check is still in flight", () => {
    vi.mocked(useAuthToken).mockReturnValue({ hasToken: null, tokenType: null });

    const { result } = renderHook(() => useAdminGuard());

    expect(result.current.isChecking).toBe(true);
    expect(window.location.href).toBe("http://localhost/admin/billing");
  });
});
