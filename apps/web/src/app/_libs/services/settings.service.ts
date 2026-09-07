import { MOCK_SETTINGS } from "@/app/_libs/mock-data/settings";
import { ApiClient, ApiError } from "@/app/_libs/services/api-client";
import { ConnectionService } from "@/app/_libs/services/connection.service";
import type { BlocklistTerm, GeneralSettings, SettingsData } from "@/types/domain";

export { ApiError as SettingsApiError };

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
  updatedAt: string;
}

export interface TenantSettingsWrite {
  escalationRatingThreshold: number;
  autoPostEnabled: boolean;
  reviewDataRetentionMonths: number | null;
}

function toStarThreshold(value: number): GeneralSettings["escalationRatingThreshold"] {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) {
    return value;
  }
  return 3;
}

function mapGeneral(api: ApiTenantSettings, aiReplyCount: number): GeneralSettings {
  return {
    escalationRatingThreshold: toStarThreshold(api.escalationRatingThreshold),
    autoPostApprovedReplies: api.autoPostEnabled,
    reviewDataRetentionMonths: api.reviewDataRetentionMonths,
    aiReplyCount,
  };
}

/**
 * Notifications remain mock until that API exists.
 * Blocklist: `GET`/`POST`/`DELETE /v1/settings/blocklist-terms`.
 * General: `GET`/`PUT /v1/settings`. `aiReplyCount` is local-only (no column).
 * Connection state comes from `GET /v1/connections`.
 */
export class SettingsService {
  static async getSettings(): Promise<SettingsData> {
    // Connection state is best-effort: a failure there should not blank the whole Settings page,
    // and the mock default stands in. The other two are not caught — an empty chip list would be
    // indistinguishable from "you have no blocked terms", which is a different claim.
    const [blocklist, general, state] = await Promise.all([
      this.listBlocklistTerms(),
      this.getGeneralSettings(),
      ConnectionService.getState().catch(() => null),
    ]);

    const settings = structuredClone(MOCK_SETTINGS);
    settings.blocklistTerms = blocklist;
    settings.general = mapGeneral(general, settings.general.aiReplyCount);

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
    return ApiClient.request<ApiTenantSettings>("/v1/settings");
  }

  static async updateGeneralSettings(write: TenantSettingsWrite): Promise<ApiTenantSettings> {
    return ApiClient.request<ApiTenantSettings>("/v1/settings", {
      method: "PUT",
      body: write,
    });
  }

  static async listBlocklistTerms(): Promise<BlocklistTerm[]> {
    const data = await ApiClient.request<ApiBlocklistTermList>("/v1/settings/blocklist-terms");
    return data.items.map((item) => ({ id: item.id, term: item.term }));
  }

  static async addBlocklistTerm(term: string): Promise<BlocklistTerm> {
    const created = await ApiClient.request<ApiBlocklistTerm>("/v1/settings/blocklist-terms", {
      method: "POST",
      body: { term },
    });
    return { id: created.id, term: created.term };
  }

  static async removeBlocklistTerm(id: string): Promise<void> {
    await ApiClient.request(`/v1/settings/blocklist-terms/${id}`, { method: "DELETE" });
  }

  static async updateSettings(settings: SettingsData): Promise<SettingsData> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return settings;
  }
}
