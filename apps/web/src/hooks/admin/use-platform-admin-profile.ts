
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { ApiError } from "@/app/_libs/services/api-error";
import { PlatformAdminProfileService } from "@/app/_libs/services/platform-admin-profile.service";
import type { PlatformAdminProfile } from "@/types/domain";

export const platformAdminProfileQueryKey = ["admin", "platform-admin-profile"] as const;

interface UsePlatformAdminProfileResult {
  profile: PlatformAdminProfile | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  updateAvatar: (avatarUrl: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  /** In-flight flag for the change-password request, so the form can block a double submit. */
  isChangingPassword: boolean;
}

export function usePlatformAdminProfile(): UsePlatformAdminProfileResult {
  const t = useTranslations("adminSettings.profile.toasts");
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: platformAdminProfileQueryKey,
    queryFn: () => PlatformAdminProfileService.get(),
  });

  useEffect(() => {
    if (profileQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.isError]);

  const updateAvatarMutation = useMutation({
    mutationFn: (avatarUrl: string) => PlatformAdminProfileService.updateAvatar(avatarUrl),
  });

  const updateAvatar = useCallback(
    async (avatarUrl: string) => {
      try {
        const updated = await updateAvatarMutation.mutateAsync(avatarUrl);
        queryClient.setQueryData<PlatformAdminProfile>(platformAdminProfileQueryKey, updated);
        toast.success(t("avatarUpdated"));
      } catch {
        toast.error(t("updateFailed"));
      }
    },
    [t, updateAvatarMutation, queryClient],
  );

  const changePasswordMutation = useMutation({
    mutationFn: ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => PlatformAdminProfileService.changePassword(currentPassword, newPassword),
  });

  /** Returns whether it succeeded, so the form knows to clear itself. */
  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      try {
        await changePasswordMutation.mutateAsync({ currentPassword, newPassword });
        toast.success(t("passwordChanged"));
        return true;
      } catch (error) {
        // Same three-way split as the tenant form (`useTenantOwnerProfile`): a 401 here is a wrong
        // current password, not a dead session — the service sends `skipRefresh` precisely so it
        // still reaches us as an error instead of signing the admin out. Collapsing all three onto
        // "Could not save this change" left the one recoverable case looking like a server fault.
        if (error instanceof ApiError && error.statusCode === 401) {
          toast.error(t("currentPasswordIncorrect"));
        } else if (error instanceof ApiError && error.statusCode === 400) {
          toast.error(error.message);
        } else {
          toast.error(t("updateFailed"));
        }
        return false;
      }
    },
    [t, changePasswordMutation],
  );

  return {
    profile: profileQuery.data ?? null,
    isLoading: profileQuery.isLoading,
    isError: profileQuery.isError,
    refetch: () => void profileQuery.refetch(),
    updateAvatar,
    changePassword,
    isChangingPassword: changePasswordMutation.isPending,
  };
}
