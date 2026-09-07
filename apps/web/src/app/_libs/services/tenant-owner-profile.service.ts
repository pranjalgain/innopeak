import { MOCK_TENANT_OWNER_PROFILE } from "@/app/_libs/mock-data/tenant-owner-profile";
import { AuthService } from "@/app/_libs/services/auth.service";
import { TokenService } from "@/app/_libs/services/token.service";
import type { TenantOwnerProfile } from "@/types/domain";

/**
 * The signed-in tenant owner's own login profile — only relevant once
 * password login exists (gated behind `AUTH_METHODS.password` in the UI).
 * Email comes from the access-token claims; avatar upload is still mock.
 * Password changes go through `POST /v1/auth/change-password`.
 * Hooks/components only ever call `useTenantOwnerProfile`, never this class directly.
 */
export class TenantOwnerProfileService {
  static async get(): Promise<TenantOwnerProfile> {
    return {
      email: TokenService.getEmail() ?? MOCK_TENANT_OWNER_PROFILE.email,
      avatarUrl: MOCK_TENANT_OWNER_PROFILE.avatarUrl,
    };
  }

  static async updateAvatar(avatarUrl: string): Promise<TenantOwnerProfile> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    MOCK_TENANT_OWNER_PROFILE.avatarUrl = avatarUrl;
    return {
      email: TokenService.getEmail() ?? MOCK_TENANT_OWNER_PROFILE.email,
      avatarUrl,
    };
  }

  static async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await AuthService.changePassword(currentPassword, newPassword);
  }
}
