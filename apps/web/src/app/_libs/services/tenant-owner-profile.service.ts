import { MOCK_TENANT_OWNER_PROFILE } from "@/app/_libs/mock-data/tenant-owner-profile";
import type { TenantOwnerProfile } from "@/types/domain";

/**
 * The signed-in tenant owner's own login profile — only relevant once
 * password login exists (gated behind `AUTH_METHODS.password` in the UI).
 * Mock implementation — becomes a real backend call once the auth module
 * exists. Hooks/components only ever call `useTenantOwnerProfile`, never
 * this class directly.
 */
export class TenantOwnerProfileService {
  static async get(): Promise<TenantOwnerProfile> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return MOCK_TENANT_OWNER_PROFILE;
  }

  static async updateAvatar(avatarUrl: string): Promise<TenantOwnerProfile> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    MOCK_TENANT_OWNER_PROFILE.avatarUrl = avatarUrl;
    return MOCK_TENANT_OWNER_PROFILE;
  }

  /** Mocks a password change — there's nothing to actually verify against yet. */
  static async changePassword(_currentPassword: string, _newPassword: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
