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

  /**
   * "Do I have a live platform-admin session right now?", answered from the httpOnly
   * `access_token` cookie rather than from localStorage — the one question `useAuthToken` cannot
   * answer for this principal.
   *
   * A platform admin has no refresh token (see `TokenService.signPlatformAdminAccessToken` on the
   * backend), so `refreshSession()` can never revive them; and a Google-accepted admin arrives
   * through a server-side redirect that leaves localStorage empty, so there is nothing stored to
   * check either. Their session lives *only* in cookies, which `JwtStrategy` accepts — so an
   * authenticated round trip is the only honest test. See `AdminGuard`, the sole caller.
   *
   * `skipRefresh` is load-bearing here, not a nicety: without it the interceptor answers a 401 by
   * calling `/v1/auth/refresh`, which — finding no refresh cookie — clears `access_token` and the
   * session hint on its way to failing (`AuthController.refresh`). That would make this *probe*
   * destroy the very session it is asking about.
   */
  static async probeSession(): Promise<boolean> {
    try {
      await adminSettingsApi.adminSettingsControllerGetProfileV1({ skipRefresh: true });
      return true;
    } catch {
      // 401 (no/expired cookie), 403 (a tenant session), or a transport failure — none of them
      // are a platform-admin session, and the guard treats all three the same way.
      return false;
    }
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
