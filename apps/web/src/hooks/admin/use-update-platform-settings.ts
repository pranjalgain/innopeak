import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/app/_libs/services/api-error";
import { PlatformSettingsService } from "@/app/_libs/services/platform-settings.service";
import { platformSettingsQueryKey } from "@/hooks/common/use-platform-settings";
import type { PlatformSettings, PlatformSettingsPatch } from "@/types/domain";

/** The backend's refusal to switch Microsoft or Google off while active users could then only sign in with it; repeating the request with `confirmLockout` overrides it. */
const LOCKOUT_ERROR_CODE = "SSO_LOGIN_DISALLOWED_SSO_ONLY_USERS";

interface PendingLockout {
  patch: PlatformSettingsPatch;
  /** The server's own wording, in the admin's language: which provider and how many users. */
  message: string;
}

interface UseUpdatePlatformSettingsResult {
  update: (patch: PlatformSettingsPatch) => Promise<boolean>;
  isUpdating: boolean;
  /** Set when the change was held back because it would lock people out; the screen asks the admin whether to go ahead. */
  pendingLockout: { message: string } | null;
  confirmLockout: () => Promise<boolean>;
  dismissLockout: () => void;
}

/** Writes into the shared `platformSettingsQueryKey` cache on success so other open screens see the change without a refetch. */
export function useUpdatePlatformSettings(): UseUpdatePlatformSettingsResult {
  const t = useTranslations("adminSettings.platform.toasts");
  const queryClient = useQueryClient();
  const [pendingLockout, setPendingLockout] = useState<PendingLockout | null>(null);

  const mutation = useMutation({
    mutationFn: (patch: PlatformSettingsPatch) => PlatformSettingsService.update(patch),
  });

  const update = useCallback(
    async (patch: PlatformSettingsPatch) => {
      try {
        const updated = await mutation.mutateAsync(patch);
        queryClient.setQueryData<PlatformSettings>(platformSettingsQueryKey, updated);
        toast.success(t("updated"));
        return true;
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.errorCode === LOCKOUT_ERROR_CODE &&
          patch.confirmLockout !== true
        ) {
          // Not a failure: a decision for the admin. No toast; the screen shows the server's message and asks.
          setPendingLockout({ patch, message: error.message });
          return false;
        }
        // A 422 is the backend refusing on purpose (e.g. notification channels not implemented yet) and says why, in the admin's language.
        toast.error(
          error instanceof ApiError && error.statusCode === 422 ? error.message : t("updateFailed"),
        );
        return false;
      }
    },
    [t, mutation, queryClient],
  );

  const confirmLockout = useCallback(async () => {
    if (pendingLockout === null) return false;
    const { patch } = pendingLockout;
    setPendingLockout(null);
    return update({ ...patch, confirmLockout: true });
  }, [pendingLockout, update]);

  const dismissLockout = useCallback(() => setPendingLockout(null), []);

  return {
    update,
    isUpdating: mutation.isPending,
    pendingLockout: pendingLockout === null ? null : { message: pendingLockout.message },
    confirmLockout,
    dismissLockout,
  };
}
