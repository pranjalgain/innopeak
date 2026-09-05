import { MOCK_PLATFORM_ADMIN_INVITES } from "@/app/_libs/mock-data/platform-admin-invites";
import type { PlatformAdminInvite } from "@/types/domain";

const INVITE_WINDOW_DAYS = 7;

/**
 * Platform admin invites — mirrors `platform_admins` + `platform_admin_invites`
 * (`apps/backend`'s `0001_platform_admin.sql`). Mock implementation — becomes a
 * real backend call once a platform-admin API exists. Hooks/components only
 * ever call `usePlatformAdminInvites`, never this class directly.
 */
export class PlatformAdminInviteService {
  static async getInvites(): Promise<PlatformAdminInvite[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_PLATFORM_ADMIN_INVITES;
  }

  static async sendInvite(email: string): Promise<PlatformAdminInvite> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const now = new Date();
    const invite: PlatformAdminInvite = {
      id: `padmin_${Date.now()}`,
      email,
      status: "invited",
      invitedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + INVITE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    };
    MOCK_PLATFORM_ADMIN_INVITES.push(invite);
    return invite;
  }

  static async revokeInvite(id: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const index = MOCK_PLATFORM_ADMIN_INVITES.findIndex((invite) => invite.id === id);
    if (index !== -1) MOCK_PLATFORM_ADMIN_INVITES.splice(index, 1);
  }
}
