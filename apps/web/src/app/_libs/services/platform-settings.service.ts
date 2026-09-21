import { adminSettingsApi } from "@/app/_libs/api-sdk/admin-settings-api";
import { settingsApi } from "@/app/_libs/api-sdk/settings-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { PlatformSettings } from "@/types/domain";

/**
 * Platform-wide feature settings, against the real `GET /v1/settings/platform-config` (public)
 * and `PATCH /v1/admin/settings/platform-config` (platform-admin only) endpoints. `get()` is
 * called from signed-out screens (login, signup) as well as from inside the app — it carries no
 * auth requirement on the backend, so `authOptional` skips attaching a token that isn't needed
 * and would otherwise trigger a pointless refresh attempt if it happened to be stale.
 * Hooks/components only ever call `usePlatformSettings`/`useUpdatePlatformSettings`, never this
 * class directly.
 */
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
