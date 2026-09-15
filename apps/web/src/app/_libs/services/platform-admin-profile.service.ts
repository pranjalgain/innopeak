import { adminSettingsApi } from "@/app/_libs/api-sdk/admin-settings-api";
import { unwrap } from "@/app/_libs/services/api-error";
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

  static async updateAvatar(avatarUrl: string): Promise<PlatformAdminProfile> {
    const response = await adminSettingsApi.adminSettingsControllerUpdateAvatarV1({
      updateAdminAvatarDto: { avatarUrl },
    });
    return unwrap<PlatformAdminProfile>(response.data);
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
}
