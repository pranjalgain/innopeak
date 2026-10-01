import { beforeEach, describe, expect, it, vi } from "vitest";

import { adminAuthApi } from "@/app/_libs/api-sdk/admin-auth-api";
import { authApi } from "@/app/_libs/api-sdk/auth-api";
import { AuthService } from "@/app/_libs/services/auth.service";
import { TokenService } from "@/app/_libs/services/token.service";

function envelope<T>(data: T) {
  return { data: { status: "Success", data } };
}

/**
 * `TokenService.getTokenType()` reads the non-credential `session` cookie the backend sets on
 * every sign-in — seeding it directly here is the jsdom equivalent of the backend's
 * `res.cookie("session", ...)`.
 */
function setSessionCookie(value: "tenant" | "admin" | null): void {
  document.cookie =
    value === null
      ? "session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"
      : `session=${value}; path=/`;
}

describe("AuthService.loginWithPassword", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("recognizes a tenant response and caches the display name", async () => {
    vi.spyOn(authApi, "authControllerLoginV1").mockResolvedValue(
      envelope({
        accessToken: "tenant-access-token",
        expiresIn: 900,
        user: {
          id: "user-1",
          tenantId: "tenant-1",
          name: "Jane Doe",
          email: "jane@thecoffeehouse.com",
          role: "owner",
          hasPassword: true,
          businessName: "The Coffee House",
          locale: null,
        },
        hasConnectedBusiness: true,
      }) as never,
    );

    const result = await AuthService.loginWithPassword("jane@thecoffeehouse.com", "StrongP@ss1");

    expect(result).toEqual({ kind: "success", hasConnectedBusiness: true });
    expect(TokenService.getName()).toBe("Jane Doe");
  });

  it("recognizes a pending_verification response without touching the cached name", async () => {
    vi.spyOn(authApi, "authControllerLoginV1").mockResolvedValue(
      envelope({
        status: "pending_verification",
        email: "jane@thecoffeehouse.com",
        message: "Verification code sent",
      }) as never,
    );

    const result = await AuthService.loginWithPassword("jane@thecoffeehouse.com", "StrongP@ss1");

    expect(result).toEqual({ kind: "verify_needed", email: "jane@thecoffeehouse.com" });
    expect(TokenService.getName()).toBeNull();
  });
});

describe("AuthService.loginAsAdmin", () => {
  /**
   * Platform-admin login has its own route (`POST /v1/admin/auth/login`) and its own method, no
   * longer a branch inside `loginWithPassword` — see `separate-admin-login-design.md`. The
   * session itself lives entirely in the httpOnly cookies the backend sets on this response; there
   * is nothing left for this method to store client-side.
   */
  it("calls the admin login route with the given credentials", async () => {
    vi.spyOn(adminAuthApi, "platformAdminAuthControllerLoginV1").mockResolvedValue(
      envelope({
        accessToken: "admin-access-token",
        expiresIn: 900,
        admin: { id: "admin-1", email: "admin@innopeak.com", locale: null },
      }) as never,
    );

    await AuthService.loginAsAdmin("admin@innopeak.com", "Admin@123456");

    expect(adminAuthApi.platformAdminAuthControllerLoginV1).toHaveBeenCalledWith(
      { loginDto: { email: "admin@innopeak.com", password: "Admin@123456" } },
      { authOptional: true },
    );
  });
});

/**
 * Regression target: logout used to send everyone to the tenant `/login`. Since the login split
 * that page has no admin path on it at all, so a signed-out admin landed somewhere they could not
 * sign back in from — the only way into the console was to type `/admin-login` by hand.
 */
describe("AuthService.logout", () => {
  const assign = vi.fn();

  beforeEach(() => {
    setSessionCookie(null);
    assign.mockClear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign, href: "http://localhost/" },
    });
    vi.spyOn(authApi, "authControllerLogoutV1").mockResolvedValue({ data: {} } as never);
  });

  it("returns a platform admin to the admin sign-in page", async () => {
    setSessionCookie("admin");

    await AuthService.logout();

    expect(assign).toHaveBeenCalledWith("/admin-login");
  });

  it("returns a tenant user to the tenant login page", async () => {
    setSessionCookie("tenant");

    await AuthService.logout();

    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("falls back to the tenant login page when there is no session at all", async () => {
    await AuthService.logout();

    expect(assign).toHaveBeenCalledWith("/login");
  });
});
