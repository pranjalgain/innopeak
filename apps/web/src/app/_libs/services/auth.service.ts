import type {
  AdminInvitePreviewDto,
  AvatarUploadAuthorizationResponseDto,
  ConfirmAvatarResponseDto,
  MemberInvitePreviewDto,
} from "@innopeak/client-sdk";

import type { CreateAccountFormValues } from "@/app/(auth)/onboarding/signup/_components/create-account-form";
import { adminAuthApi } from "@/app/_libs/api-sdk/admin-auth-api";
import { adminSettingsApi } from "@/app/_libs/api-sdk/admin-settings-api";
import { authApi } from "@/app/_libs/api-sdk/auth-api";
import { refreshSession } from "@/app/_libs/api-sdk/config";
import { SUPER_ADMIN_EMAIL } from "@/app/_libs/constants/current-owner";
import { ROUTES } from "@/app/_libs/constants/routes";
import { ApiError, unwrap } from "@/app/_libs/services/api-error";
import { TokenService } from "@/app/_libs/services/token.service";
import { setLocaleCookie } from "@/app/_libs/utils/locale";
import type { AppLocale } from "@/i18n/locales";

/**
 * Pushes a just-signed-in account's saved language into the cookie the UI actually reads
 * (`src/i18n/request.ts`), so the preference survives a new device or cleared browsing data
 * rather than living only wherever it was first chosen. The backend localizes its own responses
 * from the token claim regardless, so skipping this is what leaves a session rendering its chrome
 * in one language and its toasts in another.
 *
 * A `null` stored locale means the account never chose one — leave the cookie untouched so
 * whatever the visitor already has (or `Accept-Language`) still decides, rather than pinning them
 * to a default they never picked.
 */
function restoreStoredLocale(locale: AppLocale | null): void {
  if (locale) {
    setLocaleCookie(locale);
  }
}

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
  /** This user's current avatar, from the backend's `media` table — null until one is uploaded. */
  avatarUrl: string | null;
}

// No `refreshToken` field — the backend sets it as an httpOnly `refresh_token` cookie
// (login/verify-email/refresh), never in the JSON body. See the api-sdk config's `withCredentials`.
interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
  hasConnectedBusiness: boolean;
}

/** `POST /v1/admin/auth/login`'s response — see `PlatformAdminTokenResponseDto` on the backend. */
interface PlatformAdminTokenResponse {
  accessToken: string;
  expiresIn: number;
  admin: { id: string; email: string; locale: AppLocale | null };
}

/** `PATCH /v1/admin/settings/profile/locale`'s response — see `UpdateAdminLocaleResponseDto`. */
interface AdminUpdateLocaleResponse {
  accessToken: string;
  expiresIn: number;
  admin: { email: string; avatarUrl: string | null; locale: AppLocale | null };
}

/** `GET /v1/admin/auth/invite/:token`'s response — a real generated model, unlike `PlatformAdminTokenResponse` above. */
export type AdminInvitePreview = AdminInvitePreviewDto;

/** `GET /v1/auth/invite/:token`'s response — the tenant-member counterpart to `AdminInvitePreview`. */
export type MemberInvitePreview = MemberInvitePreviewDto;

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
 * Auth service — real backend calls against the NestJS API (`apps/backend`), via the generated
 * `@innopeak/client-sdk`. Hooks and components never call the backend, the SDK, or
 * `TokenService` directly, so nothing above this file needs to change if the backend contract does.
 *
 * Platform-admin auth has its own methods (`loginAsAdmin`, `validateAdminInvite`,
 * `acceptAdminInvite`, `startAdminInviteGoogle`) against the backend's separate
 * `/v1/admin/auth/*` routes — `loginWithPassword` below is tenant-only. See
 * `apps/documentation/docs/backend/auth/separate-admin-login-design.md` for why the two were
 * split. Tenant-member invites (`validateMemberInvite`, `acceptMemberInvite`,
 * `startMemberInviteGoogle`) are their own trio too, against `/v1/auth/invite/*` — see
 * `tenant-member-invite-design.md`. `resolveLoginDestination` below (used only by the
 * still-mocked Microsoft SSO path) is the one remaining place that guesses "admin" from the email
 * string instead of a real backend answer — real Microsoft SSO doesn't exist in the backend at
 * all yet, for either principal.
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

  /**
   * Mints a signed authorization the browser uploads the new avatar image directly with — the
   * backend never sees the file itself. See `uploadAvatarFile`
   * (`app/_libs/services/avatar-upload.service.ts`) for what a caller does with this next.
   */
  static async getAvatarUploadAuthorization(): Promise<AvatarUploadAuthorizationResponseDto> {
    const response = await authApi.tenantAvatarControllerAuthorizeV1();
    return unwrap<AvatarUploadAuthorizationResponseDto>(response.data);
  }

  /**
   * The other half of the avatar upload flow: hands the uploaded asset's provider id back to the
   * backend, which independently verifies it before persisting. Returns just the confirmed
   * `avatarUrl` — the media route has no notion of a tenant's full profile — so the caller merges
   * it into whatever it already has cached rather than replacing the object wholesale.
   */
  static async confirmAvatar(providerAssetId: string): Promise<string | null> {
    const response = await authApi.tenantAvatarControllerConfirmAvatarV1({
      confirmAvatarDto: { providerAssetId },
    });
    // `ConfirmAvatarResponseDto` types `avatarUrl` as optional (Swagger marks a nullable field
    // that way), so normalize the absent case rather than letting `undefined` reach the cache.
    const { avatarUrl } = unwrap<ConfirmAvatarResponseDto>(response.data);
    return avatarUrl ?? null;
  }

  /**
   * Real password login — tenant only. Does NOT redirect — the caller branches on the result's
   * `kind`. See `loginAsAdmin` for the platform-admin equivalent, its own route entirely.
   */
  static async loginWithPassword(email: string, password: string): Promise<LoginResult> {
    const response = await authApi.authControllerLoginV1(
      { loginDto: { email, password } },
      { authOptional: true },
    );
    // The SDK's declared return type (`TokenResponseDto`) only documents one of the two actual
    // shapes this route can answer with — see `LoginResult` above.
    const data = unwrap<TokenResponse | { status: "pending_verification"; email: string }>(
      response.data,
    );

    if ("status" in data) {
      return { kind: "verify_needed", email: data.email };
    }

    TokenService.setAccessToken(data.accessToken);
    TokenService.setName(data.user.name);
    TokenService.setHasPassword(data.user.hasPassword);
    TokenService.setBusinessName(data.user.businessName);
    restoreStoredLocale(data.user.locale);
    return { kind: "success", hasConnectedBusiness: data.hasConnectedBusiness };
  }

  /**
   * Platform-admin password login, against the backend's own `/v1/admin/auth/login` — no
   * `pending_verification`/business-name branching, since admins never self-register.
   */
  static async loginAsAdmin(email: string, password: string): Promise<void> {
    const response = await adminAuthApi.platformAdminAuthControllerLoginV1(
      { loginDto: { email, password } },
      { authOptional: true },
    );
    // The SDK's declared return type (`void`) is wrong the same way `authControllerLoginV1`'s is —
    // see `loginWithPassword`'s own comment: the backend's `@ApiResponse` here never declared a
    // `type:` the generator could turn into a model, so `PlatformAdminTokenResponse` is hand-typed
    // and asserted onto the actual envelope.
    const data = unwrap<PlatformAdminTokenResponse>(response.data);
    TokenService.setAccessToken(data.accessToken);
    restoreStoredLocale(data.admin.locale);
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
   * The admin sign-in screen's Google button — its own backend route, not `startGoogleLogin`'s.
   * An admin who accepted their invite through Google has no password at all, so the form on that
   * screen can never sign them in and this is their only way back.
   *
   * Deliberately not the tenant route with a different label: that one falls through to the tenant
   * tables when no admin identity matches, which would let the admin screen hand back a *tenant*
   * session, and sends its failures to `/login` — a page with no admin path on it. This route
   * resolves `platform_admin_identities` only, and errors back to `/admin-login`.
   */
  static startAdminGoogleLogin(): void {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
    window.location.assign("/v1/admin/auth/google");
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

  /**
   * Lands on the sign-in screen that belongs to whoever just signed out — read from the token's
   * own `type` claim, before it is cleared. A platform admin sent to the tenant `/login` was a
   * dead end: since the login split that page has no admin path on it at all, so the only way
   * back into the console was to know to type `/admin-login` by hand. Falls back to the tenant
   * page when the type can't be read (a decode hiccup, or a session already gone), which is the
   * right default for the overwhelmingly common case.
   */
  static async logout(): Promise<void> {
    const destination =
      TokenService.getTokenType() === "platform_admin" ? ROUTES.ADMIN_LOGIN : ROUTES.LOGIN;
    try {
      await authApi.authControllerLogoutV1();
    } finally {
      TokenService.clear();
      window.location.assign(destination);
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
   * Step-up verification ahead of `setPassword` — mails a 6-digit code to the caller's own
   * address. Required because an access token alone isn't proof enough to grant a passwordless
   * (Google-only) account its first password; see `setPassword`'s doc comment.
   */
  static async requestSetPasswordOtp(): Promise<void> {
    if (!TokenService.getAccessToken()) {
      const revived = await this.refreshAccessToken();
      if (!revived) {
        throw new ApiError(401, "Invalid or expired access token.");
      }
    }

    await authApi.authControllerRequestSetPasswordOtpV1({ skipRefresh: true });
  }

  /**
   * The other half of `changePassword` — for an account that has never had one (Google/SSO-only).
   * No `currentPassword` to send: there is nothing to prove yet. Takes `otp` from
   * `requestSetPasswordOtp` instead, since without some proof of live mailbox control an access
   * token alone (stolen or otherwise) would be enough to grant a permanent credential. Same
   * token-storage shape as `changePassword` on success.
   */
  static async setPassword(newPassword: string, otp: string): Promise<void> {
    if (!TokenService.getAccessToken()) {
      const revived = await this.refreshAccessToken();
      if (!revived) {
        throw new ApiError(401, "Invalid or expired access token.");
      }
    }

    const response = await authApi.authControllerSetPasswordV1(
      { setPasswordDto: { newPassword, otp } },
      { skipRefresh: true },
    );
    const data = unwrap<TokenResponse>(response.data);
    TokenService.setAccessToken(data.accessToken);
    TokenService.setName(data.user.name);
    TokenService.setHasPassword(data.user.hasPassword);
    TokenService.setBusinessName(data.user.businessName);
  }

  /**
   * Persists the signed-in caller's language preference — `users.locale` for a tenant user,
   * `platform_admins.locale` for a platform admin — so backend responses (error/success messages,
   * eventually emails) render in the same language as the UI, not just this browser's
   * `Accept-Language` header. A no-op for a signed-out visitor: the language switcher lives on
   * public pages too, where there is no account to persist the choice against and the cookie-only
   * `NEXT_LOCALE` mechanism already covers the UI's own strings.
   *
   * Branches on `TokenService.getTokenType()` rather than calling one shared endpoint for both —
   * `PATCH /v1/auth/locale` is tenant-only on the backend (see `AuthService.updateLocale`'s own
   * `TENANT_ONLY` guard) precisely because this codebase deliberately never shares one auth flow
   * between the two principals (`separate-admin-login-design.md`); the admin counterpart is its
   * own route, `PATCH /v1/admin/settings/profile/locale`.
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

    if (TokenService.getTokenType() === "platform_admin") {
      const response = await adminSettingsApi.adminSettingsControllerUpdateLocaleV1({
        updateLocaleDto: { locale },
      });
      const data = unwrap<AdminUpdateLocaleResponse>(response.data);
      TokenService.setAccessToken(data.accessToken);
      return;
    }

    const response = await authApi.authControllerUpdateLocaleV1({
      updateLocaleDto: { locale },
    });
    const data = unwrap<TokenResponse>(response.data);
    TokenService.setAccessToken(data.accessToken);
  }

  /**
   * `GET /v1/admin/auth/invite/:token` — public preview, so the accept screen can show "You've
   * been invited as `<email>`" before ever asking for a password or redirecting to Google. Throws
   * `ApiError` (404) for a token that never existed, was already used, or has expired.
   */
  static async validateAdminInvite(token: string): Promise<AdminInvitePreview> {
    const response = await adminAuthApi.platformAdminAuthControllerValidateAdminInviteV1(
      { token },
      { authOptional: true },
    );
    return unwrap<AdminInvitePreview>(response.data);
  }

  /**
   * `POST /v1/admin/auth/invite/accept` — the password path. Signs the admin in immediately on
   * success, same token-storage shape as `loginAsAdmin`. Throws `ApiError` (400) for a token that
   * never existed, was already used, or has expired, or for a weak password.
   *
   * The SDK's declared return type (`void`) is wrong the same way `loginAsAdmin`'s is — see its
   * comment above.
   */
  static async acceptAdminInvite(token: string, password: string): Promise<void> {
    const response = await adminAuthApi.platformAdminAuthControllerAcceptAdminInviteV1(
      { acceptAdminInviteDto: { token, password } },
      { authOptional: true },
    );
    const data = unwrap<PlatformAdminTokenResponse>(response.data);
    TokenService.setAccessToken(data.accessToken);
    restoreStoredLocale(data.admin.locale);
  }

  /**
   * The SSO alternative to `acceptAdminInvite` — a full-page navigation, same shape as
   * `startGoogleLogin`/`startGoogleSignup`: the browser has to follow the redirect to Google's
   * consent screen, which an XHR could not do. Never resolves — the page is gone.
   */
  static startAdminInviteGoogle(token: string): void {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/v1/admin/auth/invite/${encodeURIComponent(token)}/google`);
  }

  /**
   * `GET /v1/auth/invite/:token` — the tenant-member counterpart to `validateAdminInvite`. Same
   * generic 404 for a token that never existed, was already used, or has expired.
   */
  static async validateMemberInvite(token: string): Promise<MemberInvitePreview> {
    const response = await authApi.authControllerValidateMemberInviteV1(
      { token },
      { authOptional: true },
    );
    return unwrap<MemberInvitePreview>(response.data);
  }

  /**
   * `POST /v1/auth/invite/accept` — the password path. Unlike `acceptAdminInvite`, this carries
   * `name` (the invite-send form is email-only, same as admin's — see the backend's
   * `AcceptMemberInviteDto` for why the invitee supplies it here instead) and returns the same
   * `TokenResponseDto` shape `loginWithPassword` does, since accepting signs the member in exactly
   * like an ordinary tenant login.
   */
  static async acceptMemberInvite(
    token: string,
    name: string,
    password: string,
  ): Promise<{ hasConnectedBusiness: boolean }> {
    const response = await authApi.authControllerAcceptMemberInviteV1(
      { acceptMemberInviteDto: { token, name, password } },
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
   * The SSO alternative to `acceptMemberInvite` — a full-page navigation, same shape as
   * `startAdminInviteGoogle`: the browser has to follow the redirect to Google's consent screen,
   * which an XHR could not do. Never resolves — the page is gone.
   */
  static startMemberInviteGoogle(token: string): void {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/v1/auth/invite/${encodeURIComponent(token)}/google`);
  }
}
