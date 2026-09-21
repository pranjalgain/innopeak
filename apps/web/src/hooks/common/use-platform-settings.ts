import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { PlatformSettingsService } from "@/app/_libs/services/platform-settings.service";
import type { PlatformSettings } from "@/types/domain";

export const platformSettingsQueryKey = ["platform-settings"] as const;

/**
 * Which login methods to offer and whether tenant Settings > Members can send invites — a
 * platform-wide setting a Super Admin controls from Admin Settings, not a per-environment env
 * var. Called from signed-out screens (login, signup) as well as from inside the app: the
 * backing endpoint is public, so this works identically either way.
 *
 * Returns the raw `useQuery` result rather than a narrowed shape — call sites disagree on what
 * they need (a single field vs. the whole object, `isLoading` vs. not caring), and this is read
 * in more places than any other hook in the app.
 */
export function usePlatformSettings(): UseQueryResult<PlatformSettings> {
  return useQuery({
    queryKey: platformSettingsQueryKey,
    queryFn: () => PlatformSettingsService.get(),
  });
}
