
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { ApiError } from "@/app/_libs/services/api-error";
import { TenantOwnerProfileService } from "@/app/_libs/services/tenant-owner-profile.service";
import type { TenantOwnerProfile } from "@/types/domain";

export const tenantOwnerProfileQueryKey = ["tenant-owner-profile"] as const;

interface UseTenantOwnerProfileResult {
  profile: TenantOwnerProfile | null;
  isLoading: boolean;
  updateAvatar: (avatarUrl: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  /** Step-up verification ahead of `setPassword` — mails a 6-digit code. Returns whether it was
   *  acknowledged (network/unexpected failures only; the backend's own ack is always "success"
   *  whether or not a fresh code actually went out, to avoid leaking cooldown state). */
  requestSetPasswordOtp: () => Promise<boolean>;
  /** For an account with no password yet — flips `profile.hasPassword` to true on success, so the
   *  form swaps to the normal change-password one without a reload. */
  setPassword: (newPassword: string, otp: string) => Promise<boolean>;
}

export function useTenantOwnerProfile(): UseTenantOwnerProfileResult {
  const t = useTranslations("settings.profile.toasts");
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: tenantOwnerProfileQueryKey,
    queryFn: () => TenantOwnerProfileService.get(),
  });

  useEffect(() => {
    if (profileQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.isError]);

  const updateAvatarMutation = useMutation({
    mutationFn: (avatarUrl: string) => TenantOwnerProfileService.updateAvatar(avatarUrl),
  });

  const updateAvatar = useCallback(
    async (avatarUrl: string) => {
      try {
        const updated = await updateAvatarMutation.mutateAsync(avatarUrl);
        queryClient.setQueryData(tenantOwnerProfileQueryKey, updated);
        toast.success(t("avatarUpdated"));
      } catch {
        toast.error(t("updateFailed"));
      }
    },
    [t, updateAvatarMutation, queryClient],
  );

  const changePasswordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      TenantOwnerProfileService.changePassword(currentPassword, newPassword),
  });

  /** Returns whether it succeeded, so the form knows to clear itself. */
  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      try {
        await changePasswordMutation.mutateAsync({ currentPassword, newPassword });
        toast.success(t("passwordChanged"));
        return true;
      } catch (error) {
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
    mutationFn: () => TenantOwnerProfileService.requestSetPasswordOtp(),
  });

  const requestSetPasswordOtp = useCallback(async () => {
    try {
      await requestSetPasswordOtpMutation.mutateAsync();
      toast.success(t("otpSent"));
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 400) {
        toast.error(error.message);
      } else {
        toast.error(t("updateFailed"));
      }
      return false;
    }
  }, [t, requestSetPasswordOtpMutation]);

  const setPasswordMutation = useMutation({
    mutationFn: ({ newPassword, otp }: { newPassword: string; otp: string }) =>
      TenantOwnerProfileService.setPassword(newPassword, otp),
  });

  const setPassword = useCallback(
    async (newPassword: string, otp: string) => {
      try {
        await setPasswordMutation.mutateAsync({ newPassword, otp });
        queryClient.setQueryData<TenantOwnerProfile>(tenantOwnerProfileQueryKey, (current) =>
          current ? { ...current, hasPassword: true } : current,
        );
        toast.success(t("passwordSet"));
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 400) {
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
    updateAvatar,
    changePassword,
    requestSetPasswordOtp,
    setPassword,
  };
}
