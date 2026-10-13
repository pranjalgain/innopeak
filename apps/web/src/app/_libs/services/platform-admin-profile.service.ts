import type {
  AvatarUploadAuthorizationResponseDto,
  ConfirmAvatarResponseDto,
} from "@innopeak/client-sdk";

import { adminSettingsApi } from "@/app/_libs/api-sdk/admin-settings-api";
import { unwrap } from "@/app/_libs/services/api-error";
import { AvatarUploadService } from "@/app/_libs/services/avatar-upload.service";
import type { PlatformAdminProfile } from "@/types/domain";

export class PlatformAdminProfileService {
  static async get(): Promise<PlatformAdminProfile> {
    const response = await adminSettingsApi.adminSettingsControllerGetProfileV1();
    return unwrap<PlatformAdminProfile>(response.data);
  }

  private static async getAvatarUploadAuthorization(): Promise<AvatarUploadAuthorizationResponseDto> {
    const response = await adminSettingsApi.adminAvatarControllerAuthorizeV1();
    return unwrap<AvatarUploadAuthorizationResponseDto>(response.data);
  }

  /** Mints an authorization, uploads straight to the provider, then confirms with the backend. Returns only the confirmed URL; the caller merges it into its cached profile. */
  static async updateAvatar(file: File): Promise<string | null> {
    // Before authorizing: a file that cannot be an avatar should not cost a round trip or reach the provider.
    AvatarUploadService.validate(file);
    const authorization = await this.getAvatarUploadAuthorization();
    const providerAssetId = await AvatarUploadService.upload(file, authorization);

    const response = await adminSettingsApi.adminAvatarControllerConfirmAvatarV1({
      confirmAvatarDto: { providerAssetId },
    });
    // `avatarUrl` is typed optional (Swagger marks nullables so); normalize the absent case.
    const { avatarUrl } = unwrap<ConfirmAvatarResponseDto>(response.data);
    return avatarUrl ?? null;
  }

  /**
   * `skipRefresh` is load-bearing: a wrong current password is a 401 the interceptor cannot tell from an expired token, and an
   * admin has no refresh cookie, so it would clear the token and session role and silently sign the admin out. No token revival
   * beforehand (unlike the tenant path): an expired admin token cannot be revived; `AdminGuard` handles that.
   */
  static async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await adminSettingsApi.adminSettingsControllerChangePasswordV1(
      { changeAdminPasswordDto: { currentPassword, newPassword } },
      { skipRefresh: true },
    );
  }

  /** Step-up code mailed to the account's own address, proving mailbox control; only for an admin with no password yet (backend 400s otherwise). */
  static async requestSetPasswordOtp(): Promise<void> {
    await adminSettingsApi.adminSettingsControllerRequestSetPasswordOtpV1();
  }

  /** For an admin who never had a password (accepted via Google), so `changePassword` has nothing to check. No token reissue: admins have no refresh token to rotate. */
  static async setPassword(newPassword: string, otp: string): Promise<void> {
    await adminSettingsApi.adminSettingsControllerSetPasswordV1({
      setAdminPasswordDto: { newPassword, otp },
    });
  }
}
