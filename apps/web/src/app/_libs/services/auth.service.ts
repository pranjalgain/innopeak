import type { CreateAccountFormValues } from "@/app/(auth)/onboarding/signup/_components/create-account-form";
import { SUPER_ADMIN_EMAIL } from "@/app/_libs/constants/current-owner";
import { ROUTES } from "@/app/_libs/constants/routes";
import { ApiClient, ApiError } from "@/app/_libs/services/api-client";
import { SessionService } from "@/app/_libs/services/session.service";
import { TokenService } from "@/app/_libs/services/token.service";

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: "owner" | "member";
  hasPassword: boolean;
  businessName: string;
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

  /**
   * The authoritative "who am I" for screens that must not guess — Settings' Profile tab. Also
   * refreshes the locally stored copies, so the shell's optimistic first paint stays in step with
   * what the server just said.
   */
  static async me(): Promise<AuthenticatedUser> {
    const user = await ApiClient.request<AuthenticatedUser>("/v1/auth/me");

    TokenService.setName(user.name);
    TokenService.setHasPassword(user.hasPassword);
    TokenService.setBusinessName(user.businessName);

    return user;
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
    TokenService.setName(tokenResponse.user.name);
    TokenService.setHasPassword(tokenResponse.user.hasPassword);
    TokenService.setBusinessName(tokenResponse.user.businessName);
    await SessionService.setRole(
      tokenResponse.user.email.trim().toLowerCase() === SUPER_ADMIN_EMAIL ? "super_admin" : "tenant",
    );
    return { kind: "success", hasConnectedBusiness: tokenResponse.hasConnectedBusiness };
  }

  /**
   * Real Google sign-in. No business name: login never creates a tenant, so an unknown identity
   * comes back as `?error=NO_ACCOUNT` rather than silently signing someone up.
   */
  static startGoogleLogin(): void {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
    window.location.assign("/v1/auth/google?intent=login");
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

  /**
   * Real Google signup. A full-page navigation rather than fetch: the browser has to follow the
   * redirect to Google's consent screen, and the backend sets an httpOnly binding cookie on the
   * way out that an XHR could not carry back.
   *
   * No business name here any more — Google returns a person, not a business, so asking for one
   * before the redirect meant collecting it inside the *password* signup form, which read oddly
   * for someone who never intends to set a password. The callback now sends a genuinely new
   * signup to `/onboarding/business-name` instead; an existing or linked account still lands
   * straight on /dashboard, same as before.
   *
   * Never resolves — the page is gone.
   */
  static startGoogleSignup(): void {
    // Not a Next page: `/v1/*` is rewritten to the NestJS backend, which answers with a 302 to
    // Google's consent screen. `router.push` would ask the Next router to resolve a route that
    // does not exist in the app, and the browser must genuinely leave the origin for OAuth at all.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/v1/auth/google?intent=signup");
  }

  /**
   * The screen after `startGoogleSignup` lands on `/onboarding/business-name` submits here — the
   * one thing Google could not supply. Unlike the OAuth steps this IS a normal fetch: there is no
   * browser navigation to preserve, and the backend's `google_pending_signup` cookie (set by the
   * callback) rides along automatically via `credentials: "include"`.
   *
   * Throws `ApiError` on 400 (the pending signup expired or was already used — the caller sends
   * the visitor back to restart) or 409 (someone else claimed the email in the meantime).
   */
  static async completeGoogleSignup(businessName: string): Promise<{ hasConnectedBusiness: boolean }> {
    const data = await ApiClient.request<TokenResponse>("/v1/auth/google/complete-signup", {
      method: "POST",
      auth: false,
      body: { businessName },
    });
    TokenService.setAccessToken(data.accessToken);
    TokenService.setName(data.user.name);
    TokenService.setHasPassword(data.user.hasPassword);
    TokenService.setBusinessName(data.user.businessName);
    await SessionService.setRole("tenant");
    return { hasConnectedBusiness: data.hasConnectedBusiness };
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
      TokenService.setName(data.user.name);
      TokenService.setHasPassword(data.user.hasPassword);
      TokenService.setBusinessName(data.user.businessName);
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
    TokenService.setName(data.user.name);
    TokenService.setHasPassword(data.user.hasPassword);
    TokenService.setBusinessName(data.user.businessName);
  }

  /**
   * The other half of `changePassword` — for an account that has never had one (Google/SSO-only).
   * No `currentPassword` to send: there is nothing to prove yet. Same token-storage shape as
   * `changePassword` on success.
   */
  static async setPassword(newPassword: string): Promise<void> {
    if (!TokenService.getAccessToken()) {
      const revived = await this.refreshAccessToken();
      if (!revived) {
        throw new ApiError(401, "Invalid or expired access token.");
      }
    }

    const data = await ApiClient.request<TokenResponse>("/v1/auth/set-password", {
      method: "POST",
      body: { newPassword },
      skipRefresh: true,
    });
    TokenService.setAccessToken(data.accessToken);
    TokenService.setName(data.user.name);
    TokenService.setHasPassword(data.user.hasPassword);
    TokenService.setBusinessName(data.user.businessName);
  }
}
