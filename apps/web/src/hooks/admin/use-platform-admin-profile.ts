
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";

import { ApiError } from "@/app/_libs/services/api-error";
import { avatarUploadErrorMessage } from "@/app/_libs/services/avatar-upload.service";
import { PlatformAdminProfileService } from "@/app/_libs/services/platform-admin-profile.service";
import { useQueryErrorToast } from "@/hooks/common/use-query-error-toast";
import type { PlatformAdminProfile } from "@/types/domain";

export const platformAdminProfileQueryKey = ["admin", "platform-admin-profile"] as const;

interface UsePlatformAdminProfileResult {
  profile: PlatformAdminProfile | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  updateAvatar: (file: File) => Promise<void>;
  /** In-flight flag for the avatar upload, so the picker can disable itself and show a spinner. */
  isUploadingAvatar: boolean;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  /** In-flight flag for the change-password request, so the form can block a double submit. */
  isChangingPassword: boolean;
  /** Step-up verification ahead of `setPassword` — mails a 6-digit code. Returns whether it was
   *  acknowledged (network/unexpected failures only; the backend's own ack is always "success"
   *  whether or not a fresh code actually went out, to avoid leaking cooldown state). */
  requestSetPasswordOtp: () => Promise<boolean>;
  /** In-flight flag for the request-OTP call. */
  isSendingSetPasswordOtp: boolean;
  /** For an admin with no password yet — flips `profile.hasPassword` to true on success, so the
   *  form swaps to the normal change-password one without a reload. */
  setPassword: (newPassword: string, otp: string) => Promise<boolean>;
  /** In-flight flag for the set-password request, so the form can block a double submit. */
  isSettingPassword: boolean;
}

export function usePlatformAdminProfile(): UsePlatformAdminProfileResult {
  const t = useTranslations("adminSettings.profile.toasts");
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: platformAdminProfileQueryKey,
    queryFn: () => PlatformAdminProfileService.get(),
  });

  // This hook is called from several simultaneously mounted components (the admin shell layout,
  // ProfileSection, InviteSection) that all share this one query key — see `useQueryErrorToast`'s
  // own comment for why a plain `useEffect` here would show the same toast once per mounted
  // instance instead of once per actual failure.
  useQueryErrorToast(platformAdminProfileQueryKey, profileQuery, t("loadFailed"));

  const updateAvatarMutation = useMutation({
    mutationFn: (file: File) => PlatformAdminProfileService.updateAvatar(file),
  });

  const updateAvatar = useCallback(
    async (file: File) => {
      try {
        const avatarUrl = await updateAvatarMutation.mutateAsync(file);
        // The confirm route only ever knows the avatar itself, not this admin's full profile (see
        // `PlatformAdminProfileService.updateAvatar`) — merge into what's already cached rather
        // than replacing it.
        queryClient.setQueryData<PlatformAdminProfile>(platformAdminProfileQueryKey, (current) =>
          current ? { ...current, avatarUrl } : current,
        );
        toast.success(t("avatarUpdated"));
      } catch (error) {
        // See the tenant hook's twin: the provider's own refusal is the only message that tells
        // the user to pick a different file.
        toast.error(avatarUploadErrorMessage(error, t("updateFailed")));
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

  const requestSetPasswordOtpMutation = useMutation({
    mutationFn: () => PlatformAdminProfileService.requestSetPasswordOtp(),
  });

  const requestSetPasswordOtp = useCallback(async () => {
    try {
      await requestSetPasswordOtpMutation.mutateAsync();
      toast.success(t("otpSent"));
      return true;
    } catch (error) {
      // 429 is its own case, not a server fault: both set-password routes carry a 5/minute
      // throttle, and "Could not save this change" told an admin who had just clicked resend once
      // too often to keep trying, which is exactly the wrong advice.
      if (error instanceof ApiError && error.statusCode === 429) {
        toast.error(t("tooManyRequests"));
      } else if (error instanceof ApiError && error.statusCode === 400) {
        toast.error(error.message);
      } else {
        toast.error(t("updateFailed"));
      }
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
        // Same three-way split as `requestSetPasswordOtp`: the backend answers 429 both for the
        // route's own throttle and for a spent OTP attempt budget, and either one means "wait",
        // not "something broke".
        if (error instanceof ApiError && error.statusCode === 429) {
          toast.error(t("tooManyRequests"));
        } else if (error instanceof ApiError && error.statusCode === 400) {
          toast.error(error.message);
        } else {
          toast.error(t("updateFailed"));
        }
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
