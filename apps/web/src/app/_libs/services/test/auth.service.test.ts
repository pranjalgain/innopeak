import { beforeEach, describe, expect, it, vi } from "vitest";

import { adminAuthApi } from "@/app/_libs/api-sdk/admin-auth-api";
import { authApi } from "@/app/_libs/api-sdk/auth-api";
import { AuthService } from "@/app/_libs/services/auth.service";
import { TokenService } from "@/app/_libs/services/token.service";

function envelope<T>(data: T) {
  return { data: { status: "Success", data } };
}

describe("AuthService.loginWithPassword", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("recognizes a tenant response and stores its access token", async () => {
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
    expect(TokenService.getStoredAccessToken()).toBe("tenant-access-token");
  });

  it("recognizes a pending_verification response without touching session state", async () => {
    vi.spyOn(authApi, "authControllerLoginV1").mockResolvedValue(
      envelope({
        status: "pending_verification",
        email: "jane@thecoffeehouse.com",
        message: "Verification code sent",
      }) as never,
    );

    const result = await AuthService.loginWithPassword("jane@thecoffeehouse.com", "StrongP@ss1");

    expect(result).toEqual({ kind: "verify_needed", email: "jane@thecoffeehouse.com" });
    expect(TokenService.getStoredAccessToken()).toBeNull();
  });
});

describe("AuthService.loginAsAdmin", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /**
   * Platform-admin login has its own route (`POST /v1/admin/auth/login`) and its own method, no
   * longer a branch inside `loginWithPassword` — see `separate-admin-login-design.md`.
   */
  it("stores the admin's access token on success", async () => {
    vi.spyOn(adminAuthApi, "platformAdminAuthControllerLoginV1").mockResolvedValue(
      envelope({
        accessToken: "admin-access-token",
        expiresIn: 900,
        admin: { id: "admin-1", email: "admin@innopeak.com" },
      }) as never,
    );

    await AuthService.loginAsAdmin("admin@innopeak.com", "Admin@123456");

    expect(adminAuthApi.platformAdminAuthControllerLoginV1).toHaveBeenCalledWith(
      { loginDto: { email: "admin@innopeak.com", password: "Admin@123456" } },
      { authOptional: true },
    );
    expect(TokenService.getStoredAccessToken()).toBe("admin-access-token");
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
    localStorage.clear();
    assign.mockClear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign, href: "http://localhost/" },
    });
    vi.spyOn(authApi, "authControllerLogoutV1").mockResolvedValue({ data: {} } as never);
  });

  /** A real platform-admin JWT: only the `type` claim matters, and it is read before the clear. */
  function signedInAs(type: "tenant_user" | "platform_admin"): void {
    const claims = btoa(JSON.stringify({ type, exp: Math.floor(Date.now() / 1000) + 900 }));
    TokenService.setAccessToken(`header.${claims}.signature`);
  }

  it("returns a platform admin to the admin sign-in page", async () => {
    signedInAs("platform_admin");

    await AuthService.logout();

    expect(assign).toHaveBeenCalledWith("/admin-login");
  });

  it("returns a tenant user to the tenant login page", async () => {
    signedInAs("tenant_user");

    await AuthService.logout();

    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("falls back to the tenant login page when there is no readable token type", async () => {
    await AuthService.logout();

    expect(assign).toHaveBeenCalledWith("/login");
  });
});
