import {
  AuthService,
  type DeleteAccountInput,
  type DeleteAccountResult,
} from "@/app/_libs/services/auth.service";
import { AvatarUploadService } from "@/app/_libs/services/avatar-upload.service";
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

/** From `GET /v1/auth/me` rather than reassembled from `TokenService`: a Google sign-in leaves nothing stored, and the fallbacks used to show mock data and offer "Change password" to a Google-only account. */
export class TenantOwnerProfileService {
  static async get(): Promise<TenantOwnerProfile> {
    return toTenantOwnerProfile(await AuthService.me());
  }

  /** Mints an authorization, uploads straight to the provider (or skips to confirm for the offline `noop` one), then confirms; returns only the URL, which the caller merges into its cached profile. */
  static async updateAvatar(file: File): Promise<string | null> {
    const authorization = await AuthService.getAvatarUploadAuthorization();
    const providerAssetId = await AvatarUploadService.upload(file, authorization);
    return AuthService.confirmAvatar(providerAssetId);
  }

  static async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await AuthService.changePassword(currentPassword, newPassword);
  }

  static async requestSetPasswordOtp(): Promise<void> {
    await AuthService.requestSetPasswordOtp();
  }

  static async requestDeleteAccountOtp(): Promise<void> {
    await AuthService.requestDeleteAccountOtp();
  }

  static async deleteAccount(input: DeleteAccountInput): Promise<DeleteAccountResult> {
    return AuthService.deleteAccount(input);
  }

  /** For an account with no password yet (Google/SSO-only). */
  static async setPassword(newPassword: string, otp: string): Promise<void> {
    await AuthService.setPassword(newPassword, otp);
  }
}

/** The shell's optimistic first-paint name, still read from storage; blank (not mock data) when nothing is cached, and replaced by the real profile within one render. */
export function storedDisplayName(): string {
  return TokenService.getName() ?? "";
}
