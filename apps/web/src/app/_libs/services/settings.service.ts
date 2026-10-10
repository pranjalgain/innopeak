import type { NotificationRecipientDto, UpdateTenantSettingsDto } from "@innopeak/client-sdk";

import { settingsApi } from "@/app/_libs/api-sdk/settings-api";
import { unwrap } from "@/app/_libs/services/api-error";
import { ConnectionService } from "@/app/_libs/services/connection.service";
import type {
  BlocklistTerm,
  ConnectionInfo,
  GeneralSettings,
  NotificationChannel,
  NotificationRecipient,
  SettingsData,
} from "@/types/domain";

export { ApiError as SettingsApiError } from "@/app/_libs/services/api-error";

interface ApiBlocklistTerm {
  id: string;
  term: string;
  createdAt: string;
}

interface ApiBlocklistTermList {
  items: ApiBlocklistTerm[];
  total: number;
}

interface ApiTenantSettings {
  id: string;
  escalationRatingThreshold: number;
  autoPostEnabled: boolean;
  reviewDataRetentionMonths: number | null;
  aiReplyCount: number;
  updatedAt: string;
}

export interface TenantSettingsWrite {
  escalationRatingThreshold: number;
  autoPostEnabled: boolean;
  reviewDataRetentionMonths: number | null;
  aiReplyCount: number;
}

function toStarThreshold(value: number): GeneralSettings["escalationRatingThreshold"] {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
    return value;
  }
  return 3;
}

function mapGeneral(api: ApiTenantSettings): GeneralSettings {
  return {
    escalationRatingThreshold: toStarThreshold(api.escalationRatingThreshold),
    autoPostApprovedReplies: api.autoPostEnabled,
    reviewDataRetentionMonths: api.reviewDataRetentionMonths,
    aiReplyCount: api.aiReplyCount,
  };
}

function mapNotificationRecipient(dto: NotificationRecipientDto): NotificationRecipient {
  return {
    id: dto.id,
    name: dto.name,
    initials: dto.initials,
    channel: dto.channel as NotificationChannel,
    isActive: dto.isActive,
  };
}

/** No add/remove route for notification recipients yet (list and per-row edits only), matching the shipped UI. */
export class SettingsService {
  static async getSettings(): Promise<SettingsData> {
    // Connection state is best-effort so a failure does not blank Settings; the others are not caught, since an empty list would read as "you have none".
    const [blocklist, general, recipients, state] = await Promise.all([
      this.listBlocklistTerms(),
      this.getGeneralSettings(),
      this.listNotificationRecipients(),
      ConnectionService.getState().catch(() => null),
    ]);

    // Resolved live from GET /v1/connections so this tab cannot disagree with the dashboard guard. `needs_reauth` narrows to
    // "disconnected" because ConnectionInfo has two values; the guard's banner handles reconnect. Nothing is invented when
    // the state is unreadable: the tile then shows "disconnected" with no business, never someone else's sample data.
    const connection: ConnectionInfo = {
      status: state?.status === "connected" ? "connected" : "disconnected",
      businessName: state?.location?.businessName ?? null,
      lastSyncedAt: state?.location?.lastSyncedAt ?? null,
    };

    return {
      general,
      blocklistTerms: blocklist,
      notificationRecipients: recipients,
      connection,
    };
  }

  static async getGeneralSettings(): Promise<GeneralSettings> {
    const response = await settingsApi.tenantSettingsControllerGetV1();
    return mapGeneral(unwrap<ApiTenantSettings>(response.data));
  }

  static async updateGeneralSettings(write: TenantSettingsWrite): Promise<GeneralSettings> {
    const response = await settingsApi.tenantSettingsControllerReplaceV1({
      // The backend's `@ApiPropertyOptional` has no explicit `type`, so the generator emits `object | null`; on the wire it is a plain nullable number.
      updateTenantSettingsDto: write as unknown as UpdateTenantSettingsDto,
    });
    return mapGeneral(unwrap<ApiTenantSettings>(response.data));
  }

  static async listBlocklistTerms(): Promise<BlocklistTerm[]> {
    const response = await settingsApi.blocklistTermsControllerListV1();
    const data = unwrap<ApiBlocklistTermList>(response.data);
    return data.items.map((item) => ({ id: item.id, term: item.term }));
  }

  static async addBlocklistTerm(term: string): Promise<BlocklistTerm> {
    const response = await settingsApi.blocklistTermsControllerCreateV1({
      createBlocklistTermDto: { term },
    });
    const created = unwrap<ApiBlocklistTerm>(response.data);
    return { id: created.id, term: created.term };
  }

  static async removeBlocklistTerm(id: string): Promise<void> {
    await settingsApi.blocklistTermsControllerRemoveV1({ id });
  }

  static async listNotificationRecipients(): Promise<NotificationRecipient[]> {
    const response = await settingsApi.notificationRecipientsControllerListV1();
    const data = unwrap<{ items: NotificationRecipientDto[] }>(response.data);
    return data.items.map(mapNotificationRecipient);
  }

  /** The caller sends only what changed; the backend requires at least one field, never both. */
  static async updateNotificationRecipient(
    id: string,
    patch: { channel?: NotificationChannel; isActive?: boolean },
  ): Promise<NotificationRecipient> {
    const response = await settingsApi.notificationRecipientsControllerUpdateV1({
      recipientId: id,
      updateNotificationRecipientDto: patch,
    });
    return mapNotificationRecipient(unwrap<NotificationRecipientDto>(response.data));
  }
}
