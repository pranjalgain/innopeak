import { adminSettingsApi } from "@/app/_libs/api-sdk/admin-settings-api";
import { settingsApi } from "@/app/_libs/api-sdk/settings-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { PlatformSettings } from "@/types/domain";

/** `get()` is public and called from signed-out screens, so `authOptional` skips attaching a token (and a pointless refresh if it is stale). */
export class PlatformSettingsService {
  static async get(): Promise<PlatformSettings> {
    const response = await settingsApi.platformSettingsControllerGetV1({ authOptional: true });
    return unwrap<PlatformSettings>(response.data);
  }

  static async update(patch: Partial<PlatformSettings>): Promise<PlatformSettings> {
    const response = await adminSettingsApi.adminSettingsControllerUpdatePlatformSettingsV1({
      updatePlatformSettingsDto: patch,
    });
    return unwrap<PlatformSettings>(response.data);
  }
}
