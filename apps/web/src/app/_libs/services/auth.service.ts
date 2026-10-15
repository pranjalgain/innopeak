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
import { ROUTES } from "@/app/_libs/constants/routes";
import { ApiError, unwrap } from "@/app/_libs/services/api-error";
import { PendingSignupService } from "@/app/_libs/services/pending-signup.service";
import { TokenService } from "@/app/_libs/services/token.service";
import { setLocaleCookie } from "@/app/_libs/utils/locale";
import type { AppLocale } from "@/i18n/locales";

/**
 * Syncs a signed-in account's saved language into the UI's cookie (`src/i18n/request.ts`) so it survives a new device;
 * skipping it leaves chrome and backend toasts in different languages. A null stored locale leaves the cookie alone so
 * the visitor's existing cookie/Accept-Language still decides.
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
  /** null until an avatar is uploaded. */
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

/** `GET /v1/admin/auth/invite/:token`'s response — a real generated model, unlike `PlatformAdminTokenResponse` above. */
export type AdminInvitePreview = AdminInvitePreviewDto;

export type MemberInvitePreview = MemberInvitePreviewDto;

export type LoginResult =
  | { kind: "verify_needed"; email: string }
  | { kind: "success"; hasConnectedBusiness: boolean }
  /** The password was right but the owner scheduled the business for deletion and it can still be restored; `message` is the server's, with the deadline. */
  | { kind: "scheduled_for_deletion"; message: string };

export interface DeleteAccountResult {
  scheduledFor: string;
  gracePeriodDays: number;
  /** Whether the owner can restore it themselves (they have a password to sign in with). */
  canRestore: boolean;
}

/** Re-authentication for `deleteAccount`: the password for an owner who has one, else the emailed code. */
export interface DeleteAccountInput {
  businessName: string;
  password?: string;
  otp?: string;
}

export interface VerifyOtpResult {
  verified: boolean;
  hasConnectedBusiness: boolean;
  /** Set when the attempt failed for a reason other than a wrong code (rate limit, network, backend fault), so the OTP screen does not call a correct code invalid. */
  errorMessage?: string;
}

/** Hooks and components never call the backend, SDK or `TokenService` directly. */
export class AuthService {

  /** Also refreshes the locally cached display name so the shell's first paint matches the server. */
  static async me(): Promise<AuthenticatedUser> {
    const response = await authApi.authControllerMeV1();
    const user = unwrap<AuthenticatedUser>(response.data);

    TokenService.setName(user.name);

    return user;
  }

  /** Mints a signed authorization the browser uses to upload the avatar directly; the backend never sees the file. */
  static async getAvatarUploadAuthorization(): Promise<AvatarUploadAuthorizationResponseDto> {
    const response = await authApi.tenantAvatarControllerAuthorizeV1();
    return unwrap<AvatarUploadAuthorizationResponseDto>(response.data);
  }

  /** Hands the uploaded asset's id to the backend, which re-verifies it. Returns only `avatarUrl`, so callers merge it into cached data. */
  static async confirmAvatar(providerAssetId: string): Promise<string | null> {
    const response = await authApi.tenantAvatarControllerConfirmAvatarV1({
      confirmAvatarDto: { providerAssetId },
    });
    // `avatarUrl` is typed optional (Swagger marks nullables so); normalize the absent case.
    const { avatarUrl } = unwrap<ConfirmAvatarResponseDto>(response.data);
    return avatarUrl ?? null;
  }

  /** Tenant only; does NOT redirect, the caller branches on `kind`. */
  static async loginWithPassword(email: string, password: string): Promise<LoginResult> {
    let response;
    try {
      response = await authApi.authControllerLoginV1(
        { loginDto: { email, password } },
        { authOptional: true },
      );
    } catch (error) {
      // Only answered after the password is proven, so it is a result (not a toast) that lets the login screen offer to restore.
      if (error instanceof ApiError && error.errorCode === "ACCOUNT_SCHEDULED_FOR_DELETION") {
        return { kind: "scheduled_for_deletion", message: error.message };
      }
      throw error;
    }
    // The SDK return type documents only one of the route's two shapes (see `LoginResult`).
    const data = unwrap<TokenResponse | { status: "pending_verification"; email: string }>(
      response.data,
    );

    if ("status" in data) {
      return { kind: "verify_needed", email: data.email };
    }

    TokenService.setName(data.user.name);
    restoreStoredLocale(data.user.locale);
    // A password sign-in supersedes a half-done signup on the code step; otherwise /onboarding/signup resumed a verification that cannot succeed.
    PendingSignupService.clear();
    return { kind: "success", hasConnectedBusiness: data.hasConnectedBusiness };
  }

  /** No `pending_verification`/business-name branching: admins never self-register. */
  static async loginAsAdmin(email: string, password: string): Promise<void> {
    const response = await adminAuthApi.platformAdminAuthControllerLoginV1(
      { loginDto: { email, password } },
      { authOptional: true },
    );
    // SDK return type (`void`) is wrong: the backend's `@ApiResponse` declares no `type:`, so `PlatformAdminTokenResponse` is hand-typed onto the envelope.
    const data = unwrap<PlatformAdminTokenResponse>(response.data);
    restoreStoredLocale(data.admin.locale);
  }

  /** Login never creates a tenant: an unknown identity returns `?error=NO_ACCOUNT` instead of signing up. */
  static startGoogleLogin(): void {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
    window.location.assign("/v1/auth/google?intent=login");
  }

  /**
   * Admin sign-in Google button. Not the tenant route: that falls through to tenant tables (could return a tenant session)
   * and sends failures to `/login`, which has no admin path. This resolves `platform_admin_identities` only and errors to `/admin-login`.
   */
  static startAdminGoogleLogin(): void {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
    window.location.assign("/v1/admin/auth/google");
  }

  /**
   * Admin sign-in Microsoft button. Sign-in only (admins are invite-only): resolves `platform_admin_identities` for the
   * configured Entra directory and errors to `/admin-login`. Never the tenant route, for the same reason as `startAdminGoogleLogin`.
   */
  static startAdminMicrosoftLogin(): void {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
    window.location.assign("/v1/admin/auth/microsoft");
  }

  /** Same contract as `startGoogleLogin`: a full-page navigation, never resolves, and an unknown identity returns `?error=NO_ACCOUNT`. */
  static startMicrosoftLogin(): void {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
    window.location.assign("/v1/auth/microsoft?intent=login");
  }

  /** Same contract as `startGoogleSignup`: a new person lands on `/onboarding/business-name` via the callback. Never resolves. */
  static startMicrosoftSignup(): void {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
    window.location.assign("/v1/auth/microsoft?intent=signup");
  }

  /** Throws ApiError (409 on an already-registered email). */
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
   * Full-page navigation: the browser must follow the redirect to Google, and the backend sets an httpOnly binding cookie an
   * XHR could not carry back. No business name here (Google returns a person); the callback sends a new signup to
   * `/onboarding/business-name`. Never resolves.
   */
  static startGoogleSignup(): void {
    // Not a Next page: `/v1/*` is rewritten to the backend, which 302s to Google; `router.push` would try to resolve a nonexistent route.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/v1/auth/google?intent=signup");
  }

  /** Submits the business name the SSO provider could not supply (Google or Microsoft); the `sso_pending_signup` cookie rides via `withCredentials`. ApiError 400: pending signup expired/used; 409: email claimed meanwhile. */
  static async completeSsoSignup(businessName: string): Promise<{ hasConnectedBusiness: boolean }> {
    const response = await authApi.authControllerCompleteSsoSignupV1(
      { completeSsoSignupDto: { businessName } },
      { authOptional: true },
    );
    const data = unwrap<TokenResponse>(response.data);
    TokenService.setName(data.user.name);
    return { hasConnectedBusiness: data.hasConnectedBusiness };
  }

  static async verifySignupOtp(email: string, code: string): Promise<VerifyOtpResult> {
    try {
      const response = await authApi.authControllerVerifyEmailV1(
        { verifyEmailDto: { email, otp: code } },
        { authOptional: true },
      );
      const data = unwrap<TokenResponse>(response.data);
      TokenService.setName(data.user.name);
      PendingSignupService.clear();
      return { verified: true, hasConnectedBusiness: data.hasConnectedBusiness };
    } catch (error) {
      // Only a 400 means a wrong code (not-found/used/expired alike); 429, 5xx or network failures report their real reason.
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

  /** Uses the httpOnly `refresh_token` cookie. Returns false rather than throwing so callers can redirect to `/login`. */
  static async refreshAccessToken(): Promise<boolean> {
    const refreshed = await refreshSession();
    if (!refreshed) TokenService.clear();
    return refreshed;
  }

  /** Reads the token's `type` claim before it is cleared so a platform admin lands on `/admin-login` (the tenant `/login` has no admin path); falls back to the tenant page. */
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
   * Unconditional refresh before a `skipRefresh` call: with no JS-readable token there is no local way to tell expiry.
   * Change/set-password need it because a wrong current password is also a 401 that must not be read as an expired token.
   */
  private static async ensureFreshSession(): Promise<void> {
    const revived = await this.refreshAccessToken();
    if (!revived) {
      throw new ApiError(401, "Invalid or expired access token.");
    }
  }

  /** `skipRefresh`: a wrong current password is also a 401 and must reach the form instead of rotating the session (see `ensureFreshSession`). */
  static async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.ensureFreshSession();

    const response = await authApi.authControllerChangePasswordV1(
      { changePasswordDto: { currentPassword, newPassword } },
      { skipRefresh: true },
    );
    const data = unwrap<TokenResponse>(response.data);
    TokenService.setName(data.user.name);
  }

  /** Step-up code ahead of `setPassword`: an access token alone is not enough to give a Google-only account its first password. */
  static async requestSetPasswordOtp(): Promise<void> {
    await this.ensureFreshSession();
    await authApi.authControllerRequestSetPasswordOtpV1({ skipRefresh: true });
  }

  /** For accounts that never had a password; `otp` replaces `currentPassword`, so a stolen access token cannot grant a permanent credential. */
  static async setPassword(newPassword: string, otp: string): Promise<void> {
    await this.ensureFreshSession();

    const response = await authApi.authControllerSetPasswordV1(
      { setPasswordDto: { newPassword, otp } },
      { skipRefresh: true },
    );
    const data = unwrap<TokenResponse>(response.data);
    TokenService.setName(data.user.name);
  }

  /** Step-up code for a password-less owner ahead of `deleteAccount`; owners with a password confirm with it instead. */
  static async requestDeleteAccountOtp(): Promise<void> {
    await this.ensureFreshSession();
    await authApi.authControllerRequestDeleteAccountOtpV1({ skipRefresh: true });
  }

  /** Ends this session (the backend clears the cookies). `skipRefresh` as in `changePassword`: a wrong password is a 401 that must reach the form. */
  static async deleteAccount(input: DeleteAccountInput): Promise<DeleteAccountResult> {
    await this.ensureFreshSession();
    const response = await authApi.authControllerDeleteAccountV1(
      { deleteAccountDto: input },
      { skipRefresh: true },
    );
    const result = unwrap<DeleteAccountResult>(response.data);
    TokenService.clear();
    return result;
  }

  /** Public (no session to restore with): proves the owner by email + password; any 401 means nothing to restore for these credentials. */
  static async restoreAccount(email: string, password: string): Promise<void> {
    await authApi.authControllerRestoreAccountV1(
      { restoreAccountDto: { email, password } },
      { authOptional: true },
    );
  }

  /**
   * No-op for a signed-out visitor (the cookie-only `NEXT_LOCALE` covers public pages). Branches on token type because
   * `PATCH /v1/auth/locale` is tenant-only; admins use `PATCH /v1/admin/settings/profile/locale`.
   * Throws on failure: the language switcher waits for this before flipping the UI, so a swallowed failure would leave the UI
   * and backend messages in different languages.
   */
  static async updateLocale(locale: AppLocale): Promise<void> {
    const tokenType = TokenService.getTokenType();
    if (tokenType === null) {
      return;
    }

    if (tokenType === "platform_admin") {
      await adminSettingsApi.adminSettingsControllerUpdateLocaleV1({
        updateLocaleDto: { locale },
      });
      return;
    }

    await authApi.authControllerUpdateLocaleV1({ updateLocaleDto: { locale } });
  }

  /** Public preview for the accept screen; ApiError 404 for a token that never existed, was used, or expired. */
  static async validateAdminInvite(token: string): Promise<AdminInvitePreview> {
    const response = await adminAuthApi.platformAdminAuthControllerValidateAdminInviteV1(
      { token },
      { authOptional: true },
    );
    return unwrap<AdminInvitePreview>(response.data);
  }

  /** Signs the admin in on success; ApiError 400 for a bad token or weak password. SDK return type (`void`) is wrong, as in `loginAsAdmin`. */
  static async acceptAdminInvite(token: string, password: string): Promise<void> {
    const response = await adminAuthApi.platformAdminAuthControllerAcceptAdminInviteV1(
      { acceptAdminInviteDto: { token, password } },
      { authOptional: true },
    );
    const data = unwrap<PlatformAdminTokenResponse>(response.data);
    restoreStoredLocale(data.admin.locale);
  }

  /** Full-page navigation, like `startGoogleLogin`: the browser must follow the redirect to Google. Never resolves. */
  static startAdminInviteGoogle(token: string): void {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/v1/admin/auth/invite/${encodeURIComponent(token)}/google`);
  }

  static async validateMemberInvite(token: string): Promise<MemberInvitePreview> {
    const response = await authApi.authControllerValidateMemberInviteV1(
      { token },
      { authOptional: true },
    );
    return unwrap<MemberInvitePreview>(response.data);
  }

  /** Unlike `acceptAdminInvite`, carries `name` (the invite form is email-only) and returns the same `TokenResponseDto` as `loginWithPassword`. */
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
    TokenService.setName(data.user.name);
    return { hasConnectedBusiness: data.hasConnectedBusiness };
  }

  /** Full-page navigation, like `startAdminInviteGoogle`. Never resolves. */
  static startMemberInviteGoogle(token: string): void {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/v1/auth/invite/${encodeURIComponent(token)}/google`);
  }
}
