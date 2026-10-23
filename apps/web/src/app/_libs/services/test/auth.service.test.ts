import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { adminAuthApi } from "@/app/_libs/api-sdk/admin-auth-api";
import { authApi } from "@/app/_libs/api-sdk/auth-api";
import { endLapsedSession } from "@/app/_libs/api-sdk/config";
import { ApiError } from "@/app/_libs/services/api-error";
import { AuthService } from "@/app/_libs/services/auth.service";
import { PendingSignupService } from "@/app/_libs/services/pending-signup.service";
import { TokenService } from "@/app/_libs/services/token.service";

// Leaving the page is the interceptor's job in the browser; here only whether it was asked for matters.
vi.mock("@/app/_libs/api-sdk/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/_libs/api-sdk/config")>()),
  endLapsedSession: vi.fn(),
}));

function envelope<T>(data: T) {
  return { data: { status: "Success", data } };
}

// Seeds the non-credential `session` cookie directly, as the backend's `res.cookie("session", ...)` would.
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

  // The connect stepper is owner-only (a member's calls to it answer 403), so a member lands on the dashboard even when nothing is connected.
  it.each([
    ["member", false, true],
    ["owner", false, false],
  ] as const)("routes a %s of a business with nothing connected", async (role, connected, expected) => {
    vi.spyOn(authApi, "authControllerLoginV1").mockResolvedValue(
      envelope({
        accessToken: "tenant-access-token",
        expiresIn: 900,
        user: { id: "user-1", name: "Jane Doe", role },
        hasConnectedBusiness: connected,
      }) as never,
    );

    const result = await AuthService.loginWithPassword("jane@thecoffeehouse.com", "StrongP@ss1");

    expect(result).toEqual({ kind: "success", hasConnectedBusiness: expected });
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

describe("AuthService — owner self-service deletion", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("surfaces a scheduled-for-deletion sign-in as a result, not an error", async () => {
    vi.spyOn(authApi, "authControllerLoginV1").mockRejectedValue(
      new ApiError(403, "Scheduled for deletion on 2026-10-27.", "ACCOUNT_SCHEDULED_FOR_DELETION"),
    );

    const result = await AuthService.loginWithPassword("jane@thecoffeehouse.com", "StrongP@ss1");

    expect(result).toEqual({
      kind: "scheduled_for_deletion",
      message: "Scheduled for deletion on 2026-10-27.",
    });
  });

  it("still throws any other sign-in failure, including the generic suspension", async () => {
    vi.spyOn(authApi, "authControllerLoginV1").mockRejectedValue(
      new ApiError(403, "This account is suspended.", "TENANT_SUSPENDED"),
    );

    await expect(
      AuthService.loginWithPassword("jane@thecoffeehouse.com", "StrongP@ss1"),
    ).rejects.toMatchObject({ errorCode: "TENANT_SUSPENDED" });
  });

  it("restores through the public route with the owner's credentials", async () => {
    const restore = vi
      .spyOn(authApi, "authControllerRestoreAccountV1")
      .mockResolvedValue(envelope({ message: "Restored" }) as never);

    await AuthService.restoreAccount("jane@thecoffeehouse.com", "StrongP@ss1");

    expect(restore).toHaveBeenCalledWith(
      { restoreAccountDto: { email: "jane@thecoffeehouse.com", password: "StrongP@ss1" } },
      { authOptional: true },
    );
  });

  it("clears the cached identity once deletion is scheduled", async () => {
    TokenService.setName("Jane Doe");
    vi.spyOn(AuthService, "refreshAccessTokenOutcome").mockResolvedValue({ ok: true });
    const del = vi.spyOn(authApi, "authControllerDeleteAccountV1").mockResolvedValue(
      envelope({
        scheduledFor: "2026-10-27T00:00:00.000Z",
        gracePeriodDays: 21,
        canRestore: true,
      }) as never,
    );

    const result = await AuthService.deleteAccount({
      businessName: "The Coffee House",
      password: "StrongP@ss1",
    });

    expect(result.canRestore).toBe(true);
    expect(del).toHaveBeenCalledWith(
      { deleteAccountDto: { businessName: "The Coffee House", password: "StrongP@ss1" } },
      { skipRefresh: true },
    );
    expect(TokenService.getName()).toBeNull();
  });
});

describe("AuthService — a pending signup is forgotten once the account is signed in or verified", () => {
  const tokenResponse = {
    accessToken: "token",
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
    hasConnectedBusiness: false,
  };

  beforeEach(() => {
    window.sessionStorage.clear();
    PendingSignupService.set("jane@thecoffeehouse.com");
  });

  it("clears it after a password sign-in", async () => {
    vi.spyOn(authApi, "authControllerLoginV1").mockResolvedValue(envelope(tokenResponse) as never);

    await AuthService.loginWithPassword("jane@thecoffeehouse.com", "StrongP@ss1");

    expect(PendingSignupService.get()).toBeNull();
  });

  it("keeps it when sign-in only says the account still needs verifying", async () => {
    vi.spyOn(authApi, "authControllerLoginV1").mockResolvedValue(
      envelope({ status: "pending_verification", email: "jane@thecoffeehouse.com" }) as never,
    );

    await AuthService.loginWithPassword("jane@thecoffeehouse.com", "StrongP@ss1");

    expect(PendingSignupService.get()).toBe("jane@thecoffeehouse.com");
  });

  it("clears it once the code is verified, and keeps it after a wrong code", async () => {
    vi.spyOn(authApi, "authControllerVerifyEmailV1").mockRejectedValueOnce(
      Object.assign(new Error("bad"), { statusCode: 400 }),
    );
    await AuthService.verifySignupOtp("jane@thecoffeehouse.com", "111111");
    expect(PendingSignupService.get()).toBe("jane@thecoffeehouse.com");

    vi.spyOn(authApi, "authControllerVerifyEmailV1").mockResolvedValue(
      envelope(tokenResponse) as never,
    );
    await AuthService.verifySignupOtp("jane@thecoffeehouse.com", "000000");

    expect(PendingSignupService.get()).toBeNull();
  });
});

describe("AuthService.loginAsAdmin", () => {
  // The session lives entirely in the httpOnly cookies the backend sets; nothing is stored client-side.
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

// Regression: logout sent everyone to the tenant `/login`, which has no admin path, stranding signed-out admins.
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

  // The server's answer is what ends the session; leaving on a failed call would show the sign-in page of someone still signed in.
  it("stays put and rethrows when the sign-out request fails", async () => {
    setSessionCookie("tenant");
    TokenService.setName("Jane Doe");
    vi.spyOn(authApi, "authControllerLogoutV1").mockRejectedValue(new ApiError(503, "down"));

    await expect(AuthService.logout()).rejects.toThrow(ApiError);

    expect(assign).not.toHaveBeenCalled();
    expect(TokenService.getName()).toBe("Jane Doe");
  });

  it("falls back to the tenant login page when there is no session at all", async () => {
    await AuthService.logout();

    expect(assign).toHaveBeenCalledWith("/login");
  });
});

describe("AuthService — SSO navigation", () => {
  const assign = vi.fn();

  beforeEach(() => {
    assign.mockClear();
    vi.stubGlobal("location", { ...window.location, assign });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends Microsoft sign-in to the backend with the login intent", () => {
    AuthService.startMicrosoftLogin();

    expect(assign).toHaveBeenCalledWith("/v1/auth/microsoft?intent=login");
  });

  it("sends the admin Microsoft button to the admin route, never the tenant one", () => {
    AuthService.startAdminMicrosoftLogin();

    expect(assign).toHaveBeenCalledWith("/v1/admin/auth/microsoft");
  });

  it("sends Microsoft sign-up to the backend with the signup intent", () => {
    AuthService.startMicrosoftSignup();

    expect(assign).toHaveBeenCalledWith("/v1/auth/microsoft?intent=signup");
  });

  it("completes a new SSO signup with just the business name, whichever provider it came from", async () => {
    const complete = vi.spyOn(authApi, "authControllerCompleteSsoSignupV1").mockResolvedValue(
      envelope({
        accessToken: "tenant-access-token",
        expiresIn: 900,
        user: { id: "u1", name: "Jane Doe" },
        hasConnectedBusiness: false,
      }) as never,
    );

    await expect(AuthService.completeSsoSignup("The Coastal Table")).resolves.toEqual({
      hasConnectedBusiness: false,
    });
    expect(complete).toHaveBeenCalledWith(
      { completeSsoSignupDto: { businessName: "The Coastal Table" } },
      { authOptional: true },
    );
  });
});

// A failed refresh used to be rethrown as a 401, which the password forms read as "current password incorrect", and nothing left the page.
describe("AuthService — a change that first has to refresh the session", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(endLapsedSession).mockClear();
  });

  it("goes to sign-in, without calling it a wrong password, when the session is really over", async () => {
    vi.spyOn(AuthService, "refreshAccessTokenOutcome").mockResolvedValue({ ok: false, status: 401 });
    const change = vi.spyOn(authApi, "authControllerChangePasswordV1");

    const error = await AuthService.changePassword("Old@Pass1", "New@Str0ngPass").catch((e: unknown) => e);

    expect(endLapsedSession).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).not.toBe(401);
    expect(change).not.toHaveBeenCalled();
  });

  it.each([429, 500, 503])("keeps the session and reports the real status when the refresh answers %i", async (status) => {
    vi.spyOn(AuthService, "refreshAccessTokenOutcome").mockResolvedValue({ ok: false, status });
    const change = vi.spyOn(authApi, "authControllerChangePasswordV1");

    const error = await AuthService.changePassword("Old@Pass1", "New@Str0ngPass").catch((e: unknown) => e);

    expect(endLapsedSession).not.toHaveBeenCalled();
    expect((error as ApiError).statusCode).toBe(status);
    expect(change).not.toHaveBeenCalled();
  });

  it("reports a refresh that never reached the server as unavailable, not as a dead session", async () => {
    vi.spyOn(AuthService, "refreshAccessTokenOutcome").mockResolvedValue({ ok: false, status: 0 });

    const error = await AuthService.changePassword("Old@Pass1", "New@Str0ngPass").catch((e: unknown) => e);

    expect(endLapsedSession).not.toHaveBeenCalled();
    expect((error as ApiError).statusCode).toBe(503);
  });
});
