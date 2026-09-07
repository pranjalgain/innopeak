import type { CreateAccountFormValues } from "@/app/(auth)/onboarding/signup/_components/create-account-form";
import { SUPER_ADMIN_EMAIL } from "@/app/_libs/constants/current-owner";
import { ROUTES } from "@/app/_libs/constants/routes";
import { ApiClient, ApiError } from "@/app/_libs/services/api-client";
import { SessionService } from "@/app/_libs/services/session.service";
import { TokenService } from "@/app/_libs/services/token.service";

interface AuthenticatedUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: "owner" | "member";
}

// No `refreshToken` field — the backend sets it as an httpOnly `refresh_token` cookie
// (login/verify-email/refresh), never in the JSON body. See ApiClient's `credentials: "include"`.
interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
  hasConnectedBusiness: boolean;
}

export type LoginResult =
  | { kind: "verify_needed"; email: string }
  | { kind: "success"; hasConnectedBusiness: boolean };

export interface VerifyOtpResult {
  verified: boolean;
  hasConnectedBusiness: boolean;
  /**
   * Set when the attempt failed for a reason that is NOT "wrong code" — rate limiting, a network
   * drop, a backend fault. The OTP screen needs this to avoid telling someone their correct code
   * is invalid (which just makes them retry and dig deeper into the throttle).
   */
  errorMessage?: string;
}

/**
 * Auth service — real backend calls against the NestJS API (`apps/backend`), replacing what used
 * to be a fully mocked implementation. Hooks and components never call the backend or
 * `ApiClient`/`TokenService` directly, so nothing above this file needs to change if the backend
 * contract does.
 *
 * `email` decides which identity a login resolves to: matching `SUPER_ADMIN_EMAIL` routes to the
 * Super Admin area instead of the tenant dashboard, mirroring how the real backend keeps
 * `platform_admins` as a separate identity from tenant `users` rather than a role on the same
 * table. Real platform-admin login doesn't exist in the backend yet, so this check stays
 * client-side for now.
 */
export class AuthService {
  private static async resolveLoginDestination(email: string): Promise<string> {
    const isSuperAdmin = email.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
    await SessionService.setRole(isSuperAdmin ? "super_admin" : "tenant");
    return isSuperAdmin ? ROUTES.ADMIN : ROUTES.DASHBOARD;
  }

  static async loginWithMicrosoft(email: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    window.location.assign(await this.resolveLoginDestination(email));
  }

  /** Real password login. Does NOT redirect — the caller branches on the result (verify_needed vs. success). */
  static async loginWithPassword(email: string, password: string): Promise<LoginResult> {
    const data = await ApiClient.request<TokenResponse | { status: "pending_verification"; email: string }>(
      "/v1/auth/login",
      { method: "POST", auth: false, body: { email, password } },
    );

    if ("status" in data && data.status === "pending_verification") {
      return { kind: "verify_needed", email: data.email };
    }

    const tokenResponse = data as TokenResponse;
    TokenService.setAccessToken(tokenResponse.accessToken);
    await SessionService.setRole(
      tokenResponse.user.email.trim().toLowerCase() === SUPER_ADMIN_EMAIL ? "super_admin" : "tenant",
    );
    return { kind: "success", hasConnectedBusiness: tokenResponse.hasConnectedBusiness };
  }

  static async loginWithSocial(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    window.location.assign(await this.resolveLoginDestination(""));
  }

  /**
   * Verifies identity during signup — unlike the login methods, this never
   * redirects: the signup wizard still has a Google Business Profile
   * connection step to complete before landing on the dashboard. Signup
   * always creates a tenant, never a super admin.
   */
  static async signupWithMicrosoft(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await SessionService.setRole("tenant");
  }

  /** Real signup. Throws (ApiError, 409 on an already-registered email) — the caller catches. */
  static async signupWithPassword(values: CreateAccountFormValues): Promise<void> {
    await ApiClient.request("/v1/auth/signup", {
      method: "POST",
      auth: false,
      body: {
        businessName: values.businessName,
        ownerName: values.name,
        email: values.email,
        password: values.password,
      },
    });
  }

  static async signupWithSocial(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await SessionService.setRole("tenant");
  }

  /**
   * Verifies the OTP sent after a password signup (or a login-triggered resend) — mirrors the
   * real `users.email_verified_at` column (`apps/backend`'s `0002_tenant_auth.sql`), set once
   * verification succeeds. On success, stores the issued tokens the same way login does.
   */
  static async verifySignupOtp(email: string, code: string): Promise<VerifyOtpResult> {
    try {
      const data = await ApiClient.request<TokenResponse>("/v1/auth/verify-email", {
        method: "POST",
        auth: false,
        body: { email, otp: code },
      });
      TokenService.setAccessToken(data.accessToken);
      await SessionService.setRole("tenant");
      return { verified: true, hasConnectedBusiness: data.hasConnectedBusiness };
    } catch (error) {
      // Only a 400 actually means "that code is wrong" — the backend returns it for
      // not-found/already-used/expired alike. Anything else (429 from the attempt limiter, 5xx, a
      // network failure) is reported with the real reason instead of a misleading "invalid code".
      const isWrongCode = error instanceof ApiError && error.statusCode === 400;

      return {
        verified: false,
        hasConnectedBusiness: false,
        ...(isWrongCode
          ? {}
          : { errorMessage: error instanceof ApiError ? error.message : undefined }),
      };
    }
  }

  static async resendSignupOtp(email: string): Promise<void> {
    await ApiClient.request("/v1/auth/resend-verification-otp", {
      method: "POST",
      auth: false,
      body: { email },
    });
  }

  /**
   * Mints a fresh access token from the httpOnly `refresh_token` cookie — no body to send, the
   * cookie travels automatically via `credentials: "include"`. Returns false (doesn't throw) on
   * an invalid/expired/missing cookie, so a caller can fall back to redirecting to `/login`
   * instead of surfacing a raw network error.
   */
  static async refreshAccessToken(): Promise<boolean> {
    const refreshed = await ApiClient.refreshSession();
    if (!refreshed) TokenService.clear();
    return refreshed;
  }

  static async logout(): Promise<void> {
    try {
      await ApiClient.request("/v1/auth/logout", { method: "POST" });
    } finally {
      TokenService.clear();
      await SessionService.setRole("tenant");
      window.location.assign(ROUTES.LOGIN);
    }
  }

  /**
   * Rotates the password and the session. Stores the new access token the same way login does;
   * the refresh cookie is replaced by the backend. Throws `ApiError` on 4xx/5xx.
   *
   * `skipRefresh` is load-bearing: a wrong current password is also a 401, and treating that as
   * "access token expired" would rotate the session (or sign the user out) before the form ever
   * sees the error. If the access token has actually lapsed, revive it first, then submit.
   */
  static async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (!TokenService.getAccessToken()) {
      const revived = await this.refreshAccessToken();
      if (!revived) {
        throw new ApiError(401, "Invalid or expired access token.");
      }
    }

    const data = await ApiClient.request<TokenResponse>("/v1/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
      skipRefresh: true,
    });
    TokenService.setAccessToken(data.accessToken);
  }
}
