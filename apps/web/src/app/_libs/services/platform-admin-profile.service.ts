import type {
  AvatarUploadAuthorizationResponseDto,
  ConfirmAvatarResponseDto,
} from "@innopeak/client-sdk";

import { adminSettingsApi } from "@/app/_libs/api-sdk/admin-settings-api";
import { unwrap } from "@/app/_libs/services/api-error";
import { AvatarUploadService } from "@/app/_libs/services/avatar-upload.service";
import type { PlatformAdminProfile } from "@/types/domain";

/**
 * The signed-in super admin's own profile, against the real
 * `GET/PUT/POST /v1/admin/settings/profile*` endpoints. Hooks/components
 * only ever call `usePlatformAdminProfile`, never this class directly.
 */
export class PlatformAdminProfileService {
  static async get(): Promise<PlatformAdminProfile> {
    const response = await adminSettingsApi.adminSettingsControllerGetProfileV1();
    return unwrap<PlatformAdminProfile>(response.data);
  }

  /**
   * Mints a signed authorization the browser uploads the new avatar image directly with — see
   * `AvatarUploadService.upload` (`app/_libs/services/avatar-upload.service.ts`) for what happens
   * next.
   */
  private static async getAvatarUploadAuthorization(): Promise<AvatarUploadAuthorizationResponseDto> {
    const response = await adminSettingsApi.adminAvatarControllerAuthorizeV1();
    return unwrap<AvatarUploadAuthorizationResponseDto>(response.data);
  }

  /**
   * Direct-to-provider upload: mints an authorization, uploads straight to the provider (or skips
   * to confirm for the offline `noop` one), then confirms what actually landed with the backend,
   * which independently verifies it before persisting. Returns just the confirmed URL; the caller
   * already has the rest of the profile cached and merges this into it.
   */
  static async updateAvatar(file: File): Promise<string | null> {
    const authorization = await this.getAvatarUploadAuthorization();
    const providerAssetId = await AvatarUploadService.upload(file, authorization);

    const response = await adminSettingsApi.adminAvatarControllerConfirmAvatarV1({
      confirmAvatarDto: { providerAssetId },
    });
    // `ConfirmAvatarResponseDto` types `avatarUrl` as optional (Swagger marks a nullable field
    // that way), so normalize the absent case rather than letting `undefined` reach the cache.
    const { avatarUrl } = unwrap<ConfirmAvatarResponseDto>(response.data);
    return avatarUrl ?? null;
  }

  /**
   * `skipRefresh` is load-bearing, and more so here than on the tenant equivalent
   * (`AuthService.changePassword`, which documents the same hazard): a wrong current password
   * answers 401, the interceptor cannot tell that from an expired access token, and a platform
   * admin has no refresh cookie to retry with — so the refresh fails and the interceptor clears
   * the token *and* the session role. The admin saw only "Could not save this change", kept
   * looking at a fully-rendered shell, and was in fact signed out: every later request 401'd and
   * the next reload bounced them to `/login`.
   *
   * No token revival before the call, unlike the tenant path: an expired admin token cannot be
   * revived at all, so there is nothing to try — `AdminGuard` is what handles that case.
   */
  static async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await adminSettingsApi.adminSettingsControllerChangePasswordV1(
      { changeAdminPasswordDto: { currentPassword, newPassword } },
      { skipRefresh: true },
    );
  }

  /**
   * Step-up verification `setPassword` requires — mailed to the account's own address, proof the
   * caller still controls that mailbox. Only for an admin with no password yet; the backend 400s
   * otherwise, same as the tenant flow.
   */
  static async requestSetPasswordOtp(): Promise<void> {
    await adminSettingsApi.adminSettingsControllerRequestSetPasswordOtpV1();
  }

  /**
   * The admin-side counterpart to `AuthService.setPassword` — for an admin who has never had a
   * password (accepted their invite via Google), so there is no current password for
   * `changePassword` to check. No token to reissue afterward: a platform admin has no refresh
   * token, so there is nothing else to rotate.
   */
  static async setPassword(newPassword: string, otp: string): Promise<void> {
    await adminSettingsApi.adminSettingsControllerSetPasswordV1({
      setAdminPasswordDto: { newPassword, otp },
    });
  }
}
