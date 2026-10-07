
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";

import { AvatarUploadService } from "@/app/_libs/services/avatar-upload.service";
import { PlatformAdminProfileService } from "@/app/_libs/services/platform-admin-profile.service";
import { toastApiError } from "@/hooks/common/toast-api-error";
import { useQueryErrorToast } from "@/hooks/common/use-query-error-toast";
import type { PlatformAdminProfile } from "@/types/domain";

export const platformAdminProfileQueryKey = ["admin", "platform-admin-profile"] as const;

interface UsePlatformAdminProfileResult {
  profile: PlatformAdminProfile | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  updateAvatar: (file: File) => Promise<void>;
  isUploadingAvatar: boolean;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  isChangingPassword: boolean;
  /** Step-up verification ahead of `setPassword`; returns whether it was acknowledged. The backend always acks success so cooldown state doesn't leak. */
  requestSetPasswordOtp: () => Promise<boolean>;
  isSendingSetPasswordOtp: boolean;
  /** For an admin with no password yet; flips `profile.hasPassword` so the form swaps without a reload. */
  setPassword: (newPassword: string, otp: string) => Promise<boolean>;
  isSettingPassword: boolean;
}

export function usePlatformAdminProfile(): UsePlatformAdminProfileResult {
  const t = useTranslations("adminSettings.profile.toasts");
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: platformAdminProfileQueryKey,
    queryFn: () => PlatformAdminProfileService.get(),
  });

  // Called from several mounted components sharing one query key; see `useQueryErrorToast` for why
  // a plain `useEffect` would toast once per instance.
  useQueryErrorToast(platformAdminProfileQueryKey, profileQuery, t("loadFailed"));

  const updateAvatarMutation = useMutation({
    mutationFn: (file: File) => PlatformAdminProfileService.updateAvatar(file),
  });

  const updateAvatar = useCallback(
    async (file: File) => {
      try {
        const avatarUrl = await updateAvatarMutation.mutateAsync(file);
        // The confirm route only knows the avatar, not the full profile: merge into the cache.
        queryClient.setQueryData<PlatformAdminProfile>(platformAdminProfileQueryKey, (current) =>
          current ? { ...current, avatarUrl } : current,
        );
        toast.success(t("avatarUpdated"));
      } catch (error) {
        // See the tenant hook: the provider's refusal is the only message telling the user to pick another file.
        toast.error(AvatarUploadService.errorMessage(error, t("updateFailed")));
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
        // Same three-way split as `useTenantOwnerProfile`: a 401 is a wrong current password, not a dead
        // session (the service sends `skipRefresh` so it isn't signed out).
        toastApiError(error, { 401: t("currentPasswordIncorrect"), 400: null }, t("updateFailed"));
        return false;
      }
    },
    [t, changePasswordMutation],
  );

  const requestSetPasswordOtpMutation = useMutation({
    mutationFn: () => PlatformAdminProfileService.requestSetPasswordOtp(),
  });

  const requestSetPasswordOtp = useCallback(async () => {
    try {
      await requestSetPasswordOtpMutation.mutateAsync();
      toast.success(t("otpSent"));
      return true;
    } catch (error) {
      // 429 is not a server fault: both set-password routes have a 5/minute throttle, so keep-trying advice is wrong.
      toastApiError(error, { 429: t("tooManyRequests"), 400: null }, t("updateFailed"));
      return false;
    }
  }, [t, requestSetPasswordOtpMutation]);

  const setPasswordMutation = useMutation({
    mutationFn: ({ newPassword, otp }: { newPassword: string; otp: string }) =>
      PlatformAdminProfileService.setPassword(newPassword, otp),
  });

  const setPassword = useCallback(
    async (newPassword: string, otp: string) => {
      try {
        await setPasswordMutation.mutateAsync({ newPassword, otp });
        queryClient.setQueryData<PlatformAdminProfile>(platformAdminProfileQueryKey, (current) =>
          current ? { ...current, hasPassword: true } : current,
        );
        toast.success(t("passwordSet"));
        return true;
      } catch (error) {
        // 429 covers both the route throttle and a spent OTP attempt budget; either means "wait".
        toastApiError(error, { 429: t("tooManyRequests"), 400: null }, t("updateFailed"));
        return false;
      }
    },
    [t, setPasswordMutation, queryClient],
  );

  return {
    profile: profileQuery.data ?? null,
    isLoading: profileQuery.isLoading,
    isError: profileQuery.isError,
    refetch: () => void profileQuery.refetch(),
    updateAvatar,
    isUploadingAvatar: updateAvatarMutation.isPending,
    changePassword,
    isChangingPassword: changePasswordMutation.isPending,
    requestSetPasswordOtp,
    isSendingSetPasswordOtp: requestSetPasswordOtpMutation.isPending,
    setPassword,
    isSettingPassword: setPasswordMutation.isPending,
  };
}
