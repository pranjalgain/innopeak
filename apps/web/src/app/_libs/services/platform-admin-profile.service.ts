import { MOCK_PLATFORM_ADMIN_PROFILE } from "@/app/_libs/mock-data/platform-admin-profile";
import type { PlatformAdminProfile } from "@/types/domain";

/**
 * The signed-in super admin's own profile. Mock implementation — becomes a
 * real backend call once a platform-admin API exists. Hooks/components only
 * ever call `usePlatformAdminProfile`, never this class directly.
 */
export class PlatformAdminProfileService {
  static async get(): Promise<PlatformAdminProfile> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return MOCK_PLATFORM_ADMIN_PROFILE;
  }

  static async updateAvatar(avatarUrl: string): Promise<PlatformAdminProfile> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    MOCK_PLATFORM_ADMIN_PROFILE.avatarUrl = avatarUrl;
    return MOCK_PLATFORM_ADMIN_PROFILE;
  }

  /** Mocks a password change — there's nothing to actually verify against yet. */
  static async changePassword(_currentPassword: string, _newPassword: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
