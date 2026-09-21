import type { NotificationRecipientDto, UpdateTenantSettingsDto } from "@innopeak/client-sdk";

import { settingsApi } from "@/app/_libs/api-sdk/settings-api";
import { MOCK_SETTINGS } from "@/app/_libs/mock-data/settings";
import { unwrap } from "@/app/_libs/services/api-error";
import { ConnectionService } from "@/app/_libs/services/connection.service";
import type {
  BlocklistTerm,
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

/**
 * Blocklist: `GET`/`POST`/`DELETE /v1/settings/blocklist-terms`.
 * General (including `aiReplyCount`): `GET`/`PUT /v1/settings`.
 * Notification recipients: `GET`/`PATCH /v1/settings/notification-recipients` — list and
 * per-row channel/active edits only; there is no add/remove route yet, matching the shipped UI.
 * Connection state comes from `GET /v1/connections`.
 */
export class SettingsService {
  static async getSettings(): Promise<SettingsData> {
    // Connection state is best-effort: a failure there should not blank the whole Settings page,
    // and the mock default stands in. The others are not caught — an empty list would be
    // indistinguishable from "you have none", which is a different claim.
    const [blocklist, general, recipients, state] = await Promise.all([
      this.listBlocklistTerms(),
      this.getGeneralSettings(),
      this.listNotificationRecipients(),
      ConnectionService.getState().catch(() => null),
    ]);

    const settings = structuredClone(MOCK_SETTINGS);
    settings.blocklistTerms = blocklist;
    settings.general = mapGeneral(general);
    settings.notificationRecipients = recipients;

    // Resolved live from GET /v1/connections — the same call the dashboard guard reads, so this
    // tab can never disagree with whether the app actually let the user in. `needs_reauth` is
    // narrowed to "disconnected" here because the shipped ConnectionInfo union has only two
    // values; the reconnect affordance for that state lives in the guard's banner.
    if (state) {
      settings.connection.status = state.status === "connected" ? "connected" : "disconnected";
      if (state.location) {
        settings.connection.businessName = state.location.businessName;
        settings.connection.lastSyncedAt =
          state.location.lastSyncedAt ?? settings.connection.lastSyncedAt;
      }
    }

    return settings;
  }

  static async getGeneralSettings(): Promise<ApiTenantSettings> {
    const response = await settingsApi.tenantSettingsControllerGetV1();
    return unwrap<ApiTenantSettings>(response.data);
  }

  static async updateGeneralSettings(write: TenantSettingsWrite): Promise<ApiTenantSettings> {
    const response = await settingsApi.tenantSettingsControllerReplaceV1({
      // The backend's `@ApiPropertyOptional` for this field has no explicit `type`, so the
      // generator falls back to `object | null` for `reviewDataRetentionMonths` — a documentation
      // gap, not a real contract change; the field is a plain nullable number on the wire.
      updateTenantSettingsDto: write as unknown as UpdateTenantSettingsDto,
    });
    return unwrap<ApiTenantSettings>(response.data);
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

  /** Both fields optional — the caller sends only what changed (channel toggle vs. active
   *  switch fire independently), matching the backend's own "at least one, never both required"
   *  contract. */
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
