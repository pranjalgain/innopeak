import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";

import { PlatformSettingsService } from "@/app/_libs/services/platform-settings.service";
import { platformSettingsQueryKey } from "@/hooks/common/use-platform-settings";
import type { PlatformSettings } from "@/types/domain";

interface UseUpdatePlatformSettingsResult {
  update: (patch: Partial<PlatformSettings>) => Promise<boolean>;
  isUpdating: boolean;
}

/** Writes into the shared `platformSettingsQueryKey` cache on success so other open screens see the change without a refetch. */
export function useUpdatePlatformSettings(): UseUpdatePlatformSettingsResult {
  const t = useTranslations("adminSettings.platform.toasts");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (patch: Partial<PlatformSettings>) => PlatformSettingsService.update(patch),
  });

  const update = useCallback(
    async (patch: Partial<PlatformSettings>) => {
      try {
        const updated = await mutation.mutateAsync(patch);
        queryClient.setQueryData<PlatformSettings>(platformSettingsQueryKey, updated);
        toast.success(t("updated"));
        return true;
      } catch {
        toast.error(t("updateFailed"));
        return false;
      }
    },
    [t, mutation, queryClient],
  );

  return { update, isUpdating: mutation.isPending };
}
