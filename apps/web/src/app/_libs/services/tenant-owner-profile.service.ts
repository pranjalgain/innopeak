import { AuthService } from "@/app/_libs/services/auth.service";
import { uploadAvatarFile } from "@/app/_libs/services/avatar-upload.service";
import { TokenService } from "@/app/_libs/services/token.service";
import type { TenantOwnerProfile } from "@/types/domain";

function toTenantOwnerProfile(me: {
  name: string;
  email: string;
  businessName: string;
  hasPassword: boolean;
  role: TenantOwnerProfile["role"];
  avatarUrl: string | null;
}): TenantOwnerProfile {
  return {
    name: me.name,
    email: me.email,
    businessName: me.businessName,
    hasPassword: me.hasPassword,
    role: me.role,
    avatarUrl: me.avatarUrl,
  };
}

/**
 * The signed-in tenant owner's own login profile — name, email, tenant name, avatar, and whether a
 * password exists, all from `GET /v1/auth/me`.
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
    return toTenantOwnerProfile(await AuthService.me());
  }

  /**
   * Direct-to-provider upload: mints an authorization, uploads straight to the provider (or skips
   * to confirm for the offline `noop` one), then confirms what actually landed — see
   * `uploadAvatarFile` and `AuthService.confirmAvatar`. Returns just the confirmed URL; the caller
   * already has the rest of the profile cached and merges this into it.
   */
  static async updateAvatar(file: File): Promise<string | null> {
    const authorization = await AuthService.getAvatarUploadAuthorization();
    const providerAssetId = await uploadAvatarFile(file, authorization);
    return AuthService.confirmAvatar(providerAssetId);
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
