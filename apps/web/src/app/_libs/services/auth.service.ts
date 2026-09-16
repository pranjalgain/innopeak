import type { CreateAccountFormValues } from "@/app/(auth)/onboarding/signup/_components/create-account-form";
import { authApi } from "@/app/_libs/api-sdk/auth-api";
import { refreshSession } from "@/app/_libs/api-sdk/config";
import { SUPER_ADMIN_EMAIL } from "@/app/_libs/constants/current-owner";
import { ROUTES } from "@/app/_libs/constants/routes";
import { ApiError, unwrap } from "@/app/_libs/services/api-error";
import { TokenService } from "@/app/_libs/services/token.service";
import type { AppLocale } from "@/i18n/locales";

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: "owner" | "member";
  hasPassword: boolean;
  businessName: string;
  /** `users.locale` — null when the user has never set one (falls back to `Accept-Language`). */
  locale: AppLocale | null;
}

// No `refreshToken` field — the backend sets it as an httpOnly `refresh_token` cookie
// (login/verify-email/refresh), never in the JSON body. See the api-sdk config's `withCredentials`.
interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
  hasConnectedBusiness: boolean;
}

/** `POST /v1/auth/login`'s platform-admin branch — see `PlatformAdminTokenResponseDto` on the backend. */
interface PlatformAdminTokenResponse {
  accessToken: string;
  expiresIn: number;
  admin: { id: string; email: string };
}

export type LoginResult =
  | { kind: "verify_needed"; email: string }
  | { kind: "success"; hasConnectedBusiness: boolean }
  | { kind: "admin_success" };

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
 * Auth service — real backend calls against the NestJS API (`apps/backend`), via the generated
 * `@innopeak/client-sdk`. Hooks and components never call the backend, the SDK, or
 * `TokenService` directly, so nothing above this file needs to change if the backend contract does.
 *
 * There is one shared sign-in screen for every identity — `loginWithPassword` posts to the same
 * `POST /v1/auth/login` regardless of who's typing, and the backend itself resolves which identity
 * space the email belongs to (`platform_admins` checked first, tenant `users` as the fallback —
 * see `AuthService.login`'s doc comment on the backend). The response shape is the discriminant:
 * an `admin` field means a platform admin, `status` means a still-`pending_verification` tenant
 * account, otherwise a normal tenant token response. `resolveLoginDestination` below (used only by
 * the still-mocked Microsoft SSO path) is the one remaining place that guesses from the email
 * string instead — real Microsoft SSO doesn't exist in the backend at all yet.
 */
export class AuthService {
  private static resolveLoginDestination(email: string): string {
    const isSuperAdmin = email.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
    return isSuperAdmin ? ROUTES.ADMIN : ROUTES.DASHBOARD;
  }

  static async loginWithMicrosoft(email: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    window.location.assign(this.resolveLoginDestination(email));
  }

  /**
   * The authoritative "who am I" for screens that must not guess — Settings' Profile tab. Also
   * refreshes the locally stored copies, so the shell's optimistic first paint stays in step with
   * what the server just said.
   */
  static async me(): Promise<AuthenticatedUser> {
    const response = await authApi.authControllerMeV1();
    const user = unwrap<AuthenticatedUser>(response.data);

    TokenService.setName(user.name);
    TokenService.setHasPassword(user.hasPassword);
    TokenService.setBusinessName(user.businessName);

    return user;
  }

  /** Real password login. Does NOT redirect — the caller branches on the result's `kind`. */
  static async loginWithPassword(email: string, password: string): Promise<LoginResult> {
    const response = await authApi.authControllerLoginV1(
      { loginDto: { email, password } },
      { authOptional: true },
    );
    // The SDK's declared return type (`TokenResponseDto`) only documents one of the three actual
    // shapes this route can answer with — see `PlatformAdminTokenResponse` and `LoginResult` above.
    const data = unwrap<
      TokenResponse | PlatformAdminTokenResponse | { status: "pending_verification"; email: string }
    >(response.data);

    if ("status" in data) {
      return { kind: "verify_needed", email: data.email };
    }

    if ("admin" in data) {
      TokenService.setAccessToken(data.accessToken);
      return { kind: "admin_success" };
    }

    TokenService.setAccessToken(data.accessToken);
    TokenService.setName(data.user.name);
    TokenService.setHasPassword(data.user.hasPassword);
    TokenService.setBusinessName(data.user.businessName);
    return { kind: "success", hasConnectedBusiness: data.hasConnectedBusiness };
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
  }

  /** Real signup. Throws (ApiError, 409 on an already-registered email) — the caller catches. */
  static async signupWithPassword(values: CreateAccountFormValues): Promise<void> {
    await authApi.authControllerSignupV1(
      {
        signupDto: {
          businessName: values.businessName,
          ownerName: values.name,
          email: values.email,
          password: values.password,
        },
      },
      { authOptional: true },
    );
  }

  /**
   * Real Google signup. A full-page navigation rather than an SDK call: the browser has to follow
   * the redirect to Google's consent screen, and the backend sets an httpOnly binding cookie on
   * the way out that an XHR could not carry back.
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
   * one thing Google could not supply. Unlike the OAuth steps this IS a normal request: there is
   * no browser navigation to preserve, and the backend's `google_pending_signup` cookie (set by
   * the callback) rides along automatically via `withCredentials`.
   *
   * Throws `ApiError` on 400 (the pending signup expired or was already used — the caller sends
   * the visitor back to restart) or 409 (someone else claimed the email in the meantime).
   */
  static async completeGoogleSignup(
    businessName: string,
  ): Promise<{ hasConnectedBusiness: boolean }> {
    const response = await authApi.authControllerCompleteGoogleSignupV1(
      { completeGoogleSignupDto: { businessName } },
      { authOptional: true },
    );
    const data = unwrap<TokenResponse>(response.data);
    TokenService.setAccessToken(data.accessToken);
    TokenService.setName(data.user.name);
    TokenService.setHasPassword(data.user.hasPassword);
    TokenService.setBusinessName(data.user.businessName);
    return { hasConnectedBusiness: data.hasConnectedBusiness };
  }

  /**
   * Verifies the OTP sent after a password signup (or a login-triggered resend) — mirrors the
   * real `users.email_verified_at` column (`apps/backend`'s `0002_tenant_auth.sql`), set once
   * verification succeeds. On success, stores the issued tokens the same way login does.
   */
  static async verifySignupOtp(email: string, code: string): Promise<VerifyOtpResult> {
    try {
      const response = await authApi.authControllerVerifyEmailV1(
        { verifyEmailDto: { email, otp: code } },
        { authOptional: true },
      );
      const data = unwrap<TokenResponse>(response.data);
      TokenService.setAccessToken(data.accessToken);
      TokenService.setName(data.user.name);
      TokenService.setHasPassword(data.user.hasPassword);
      TokenService.setBusinessName(data.user.businessName);
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
    await authApi.authControllerResendOtpV1({ resendOtpDto: { email } }, { authOptional: true });
  }

  /**
   * Mints a fresh access token from the httpOnly `refresh_token` cookie — no body to send, the
   * cookie travels automatically via `withCredentials`. Returns false (doesn't throw) on
   * an invalid/expired/missing cookie, so a caller can fall back to redirecting to `/login`
   * instead of surfacing a raw network error.
   */
  static async refreshAccessToken(): Promise<boolean> {
    const refreshed = await refreshSession();
    if (!refreshed) TokenService.clear();
    return refreshed;
  }

  static async logout(): Promise<void> {
    try {
      await authApi.authControllerLogoutV1();
    } finally {
      TokenService.clear();
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

    const response = await authApi.authControllerChangePasswordV1(
      { changePasswordDto: { currentPassword, newPassword } },
      { skipRefresh: true },
    );
    const data = unwrap<TokenResponse>(response.data);
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

    const response = await authApi.authControllerSetPasswordV1(
      { setPasswordDto: { newPassword } },
      { skipRefresh: true },
    );
    const data = unwrap<TokenResponse>(response.data);
    TokenService.setAccessToken(data.accessToken);
    TokenService.setName(data.user.name);
    TokenService.setHasPassword(data.user.hasPassword);
    TokenService.setBusinessName(data.user.businessName);
  }

  /**
   * Persists the signed-in user's language preference (`users.locale`) so backend responses —
   * error/success messages, and eventually emails — render in the same language as the UI, not
   * just this browser's `Accept-Language` header. A no-op for a signed-out visitor: the language
   * switcher lives on public pages too, where there is no account to persist the choice against
   * and the cookie-only `NEXT_LOCALE` mechanism already covers the UI's own strings.
   *
   * Throws on failure rather than swallowing it: the caller (the language switcher) waits for
   * this to resolve before it flips the UI's own language, so a failed sync must not be reported
   * as a success — the two would otherwise disagree, with the UI in the new language and every
   * backend-originated message still arriving in the old one.
   */
  static async updateLocale(locale: AppLocale): Promise<void> {
    if (!TokenService.getStoredAccessToken()) {
      return;
    }

    const response = await authApi.authControllerUpdateLocaleV1({
      updateLocaleDto: { locale },
    });
    const data = unwrap<TokenResponse>(response.data);
    TokenService.setAccessToken(data.accessToken);
  }
}
