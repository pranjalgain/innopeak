import { MOCK_SETTINGS } from "@/app/_libs/mock-data/settings";
import { ConnectionService } from "@/app/_libs/services/connection.service";
import type { SettingsData } from "@/types/domain";

/**
 * Settings service. Mock implementation — becomes a real backend call once
 * that API exists. `updateSettings` mocks a full-resource PUT; the hook owns
 * the interactive local state between saves. Hooks and components only ever
 * call `useSettings`, never this class directly.
 */
export class SettingsService {
  static async getSettings(): Promise<SettingsData> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const settings = structuredClone(MOCK_SETTINGS);
    // Resolved live from GET /v1/connections — the same call the dashboard guard reads, so this
    // tab can never disagree with whether the app actually let the user in. `needs_reauth` is
    // narrowed to "disconnected" here because the shipped ConnectionInfo union has only two
    // values; the reconnect affordance for that state lives in the guard's banner.
    const state = await ConnectionService.getState().catch(() => null);
    if (state) {
      settings.connection.status = state.status === "connected" ? "connected" : "disconnected";
      if (state.location) {
        settings.connection.businessName = state.location.businessName;
        settings.connection.lastSyncedAt = state.location.lastSyncedAt ?? settings.connection.lastSyncedAt;
      }
    }
    return settings;
  }

  static async updateSettings(settings: SettingsData): Promise<SettingsData> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return settings;
  }
}
