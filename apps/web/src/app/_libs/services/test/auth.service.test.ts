import { beforeEach, describe, expect, it, vi } from "vitest";

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

  /**
   * Regression target: this used to decide "admin or tenant" by string-matching the submitted
   * email against a hardcoded constant, purely client-side. Now the backend itself resolves the
   * identity (`platform_admins` checked first) and the response shape is the only signal this
   * reads — an `admin` field means a platform admin, `status` a still-pending tenant account,
   * otherwise a normal tenant session.
   */
  it("recognizes a platform-admin response and stores its access token", async () => {
    vi.spyOn(authApi, "authControllerLoginV1").mockResolvedValue(
      envelope({
        accessToken: "admin-access-token",
        expiresIn: 900,
        admin: { id: "admin-1", email: "admin@innopeak.com" },
      }) as never,
    );

    const result = await AuthService.loginWithPassword("admin@innopeak.com", "Admin@123456");

    expect(result).toEqual({ kind: "admin_success" });
    expect(TokenService.getStoredAccessToken()).toBe("admin-access-token");
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
