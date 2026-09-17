import { MOCK_TENANT_OWNER_PROFILE } from "@/app/_libs/mock-data/tenant-owner-profile";
import { AuthService } from "@/app/_libs/services/auth.service";
import { TokenService } from "@/app/_libs/services/token.service";
import type { TenantOwnerProfile } from "@/types/domain";

/**
 * The signed-in tenant owner's own login profile. Name, email, tenant name and whether a password
 * exists all come from `GET /v1/auth/me`; only the avatar is still mock.
 *
 * That endpoint exists because the alternative — reassembling this from what the last sign-in
 * happened to leave in `TokenService` — cannot answer honestly. A session predating those
 * localStorage keys (or a Google sign-in, which is redirect-only and returns no JSON body to the
 * SPA) had nothing stored, and the fallbacks then filled the gap with mock data: a stranger's name
 * and company shown as fact, and `hasPassword: true` offering "Change password" to a Google-only
 * account that has none. Asking the server per load removes the guess entirely.
 *
 * Hooks/components only ever call `useTenantOwnerProfile`, never this class directly.
 */
export class TenantOwnerProfileService {
  static async get(): Promise<TenantOwnerProfile> {
    const me = await AuthService.me();

    return {
      name: me.name,
      email: me.email,
      businessName: me.businessName,
      hasPassword: me.hasPassword,
      role: me.role,
      avatarUrl: MOCK_TENANT_OWNER_PROFILE.avatarUrl,
    };
  }

  static async updateAvatar(avatarUrl: string): Promise<TenantOwnerProfile> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    MOCK_TENANT_OWNER_PROFILE.avatarUrl = avatarUrl;

    const profile = await this.get();
    return { ...profile, avatarUrl };
  }

  static async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await AuthService.changePassword(currentPassword, newPassword);
  }

  /** See `AuthService.requestSetPasswordOtp`. */
  static async requestSetPasswordOtp(): Promise<void> {
    await AuthService.requestSetPasswordOtp();
  }

  /** For an account with no password yet (Google/SSO-only) — see `AuthService.setPassword`. */
  static async setPassword(newPassword: string, otp: string): Promise<void> {
    await AuthService.setPassword(newPassword, otp);
  }
}

/**
 * The shell's optimistic name/avatar source, still read from storage: it paints on first render,
 * before any request resolves, and a wrong-but-brief name there is a worse trade than a blank one.
 * Falls back to the email claim rather than mock data for exactly that reason.
 */
export function storedDisplayName(): string {
  return TokenService.getName() ?? TokenService.getEmail() ?? "";
}
