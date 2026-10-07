import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { PlatformSettingsService } from "@/app/_libs/services/platform-settings.service";
import type { PlatformSettings } from "@/types/domain";

export const platformSettingsQueryKey = ["platform-settings"] as const;

/** Platform-wide login-method and invite toggles set by a Super Admin. The endpoint is public, so it works signed out. Returns the raw `useQuery` result since call sites need different slices. */
export function usePlatformSettings(): UseQueryResult<PlatformSettings> {
  return useQuery({
    queryKey: platformSettingsQueryKey,
    queryFn: () => PlatformSettingsService.get(),
  });
}
