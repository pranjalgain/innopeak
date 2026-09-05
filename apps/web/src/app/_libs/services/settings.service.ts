import { MOCK_SETTINGS } from "@/app/_libs/mock-data/settings";
import { GoogleConnectionService } from "@/app/_libs/services/google-connection.service";
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
    // `connection.status` is the same flag the dashboard access guard and
    // onboarding-connect flow read/write — always resolve it live rather
    // than trusting the static mock default.
    settings.connection.status = await GoogleConnectionService.getStatus();
    return settings;
  }

  static async updateSettings(settings: SettingsData): Promise<SettingsData> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return settings;
  }
}
