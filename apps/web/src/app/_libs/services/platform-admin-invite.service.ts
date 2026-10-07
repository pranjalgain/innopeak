import { adminSettingsApi } from "@/app/_libs/api-sdk/admin-settings-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { PlatformAdminInvite } from "@/types/domain";

export class PlatformAdminInviteService {
  static async getInvites(): Promise<PlatformAdminInvite[]> {
    const response = await adminSettingsApi.adminSettingsControllerListInvitesV1();
    return unwrap<PlatformAdminInvite[]>(response.data);
  }

  static async sendInvite(email: string): Promise<PlatformAdminInvite> {
    const response = await adminSettingsApi.adminSettingsControllerSendInviteV1({
      sendAdminInviteDto: { email },
    });
    return unwrap<PlatformAdminInvite>(response.data);
  }

  static async revokeInvite(id: string): Promise<void> {
    await adminSettingsApi.adminSettingsControllerRevokeInviteV1({ inviteId: id });
  }

  /** Disables (`enabled: false`) or re-enables an accepted admin — returns the updated roster row. */
  static async setAdminStatus(id: string, enabled: boolean): Promise<PlatformAdminInvite> {
    const response = await adminSettingsApi.adminSettingsControllerSetAdminStatusV1({
      adminId: id,
      setAdminStatusDto: { enabled },
    });
    return unwrap<PlatformAdminInvite>(response.data);
  }
}
