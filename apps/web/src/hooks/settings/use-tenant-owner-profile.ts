
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";

import type { DeleteAccountInput, DeleteAccountResult } from "@/app/_libs/services/auth.service";
import { AvatarUploadService } from "@/app/_libs/services/avatar-upload.service";
import { TenantOwnerProfileService } from "@/app/_libs/services/tenant-owner-profile.service";
import { isInitialLoad } from "@/hooks/common/is-initial-load";
import { toastApiError } from "@/hooks/common/toast-api-error";
import { useQueryErrorToast } from "@/hooks/common/use-query-error-toast";
import type { TenantOwnerProfile } from "@/types/domain";

export const tenantOwnerProfileQueryKey = ["tenant-owner-profile"] as const;

interface UseTenantOwnerProfileResult {
  profile: TenantOwnerProfile | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  updateAvatar: (file: File) => Promise<void>;
  isUploadingAvatar: boolean;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  /**
   * Step-up verification ahead of `setPassword`. Returns whether it was acknowledged (false only on
   * network/unexpected failures: the backend always acks "success" so cooldown state does not
   * leak).
   */
  requestSetPasswordOtp: () => Promise<boolean>;
  /**
   * For an account with no password yet; flips `profile.hasPassword` so the form swaps to change-
   * password without a reload.
   */
  setPassword: (newPassword: string, otp: string) => Promise<boolean>;
  /** Mails the step-up code an owner without a password confirms deletion with. */
  requestDeleteAccountOtp: () => Promise<boolean>;
  /**
   * Schedules erasure and ends the session. Resolves to the schedule, or null on failure (toast
   * already shown).
   */
  deleteAccount: (input: DeleteAccountInput) => Promise<DeleteAccountResult | null>;
}

export function useTenantOwnerProfile(): UseTenantOwnerProfileResult {
  const t = useTranslations("settings.profile.toasts");
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: tenantOwnerProfileQueryKey,
    queryFn: () => TenantOwnerProfileService.get(),
  });

  // Called from several simultaneously mounted components sharing one query key; see
  // `useQueryErrorToast` for why a plain `useEffect` would toast once per instance.
  useQueryErrorToast(tenantOwnerProfileQueryKey, profileQuery, t("loadFailed"));

  const updateAvatarMutation = useMutation({
    mutationFn: (file: File) => TenantOwnerProfileService.updateAvatar(file),
  });

  const updateAvatar = useCallback(
    async (file: File) => {
      try {
        const avatarUrl = await updateAvatarMutation.mutateAsync(file);
        // The confirm route only knows the avatar, not the full profile (see
        // `TenantOwnerProfileService.updateAvatar`): merge into the cache rather than replace it.
        queryClient.setQueryData<TenantOwnerProfile>(tenantOwnerProfileQueryKey, (current) =>
          current ? { ...current, avatarUrl } : current,
        );
        toast.success(t("avatarUpdated"));
      } catch (error) {
        // A wrong or oversized file is named as such (the generic "could not save" left people retrying the same photo);
        // anything else gets the generic copy.
        toast.error(
          AvatarUploadService.errorMessage(error, {
            fallback: t("updateFailed"),
            tooLarge: t("avatarTooLarge"),
            unsupportedType: t("avatarUnsupportedType"),
          }),
        );
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
        toastApiError(error, { 401: t("currentPasswordIncorrect"), 400: null }, t("updateFailed"));
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
      // 429 is not a server fault: both set-password routes are throttled 5/minute, and "Could not
      // save this change" would tell an owner who clicked resend too often to keep trying.
      toastApiError(error, { 429: t("tooManyRequests"), 400: null }, t("updateFailed"));
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
        // Same three-way split as `requestSetPasswordOtp`: 429 means "wait" (route throttle or
        // spent OTP budget), not "something broke".
        toastApiError(error, { 429: t("tooManyRequests"), 400: null }, t("updateFailed"));
        return false;
      }
    },
    [t, setPasswordMutation, queryClient],
  );

  const requestDeleteAccountOtpMutation = useMutation({
    mutationFn: () => TenantOwnerProfileService.requestDeleteAccountOtp(),
  });

  const requestDeleteAccountOtp = useCallback(async () => {
    try {
      await requestDeleteAccountOtpMutation.mutateAsync();
      toast.success(t("otpSent"));
      return true;
    } catch (error) {
      toastApiError(error, { 429: t("tooManyRequests"), 400: null }, t("updateFailed"));
      return false;
    }
  }, [t, requestDeleteAccountOtpMutation]);

  const deleteAccountMutation = useMutation({
    mutationFn: (input: DeleteAccountInput) => TenantOwnerProfileService.deleteAccount(input),
  });

  const deleteAccount = useCallback(
    async (input: DeleteAccountInput) => {
      try {
        // The cache is left alone: the confirmation screen still reads the profile, and "Back to
        // sign in" is a full page load that drops it anyway.
        return await deleteAccountMutation.mutateAsync(input);
      } catch (error) {
        // 400 = wrong business name / bad or missing code, 401 = wrong password, 409 = no longer
        // possible, 429 = throttle or spent code budget; each carries server-authored copy except
        // 401, whose generic wording is the profile form's.
        toastApiError(
          error,
          { 400: null, 401: t("currentPasswordIncorrect"), 409: null, 429: t("tooManyRequests") },
          t("updateFailed"),
        );
        return null;
      }
    },
    [t, deleteAccountMutation],
  );

  return {
    profile: profileQuery.data ?? null,
    isLoading: isInitialLoad(profileQuery),
    isError: profileQuery.isError,
    refetch: () => void profileQuery.refetch(),
    updateAvatar,
    isUploadingAvatar: updateAvatarMutation.isPending,
    changePassword,
    requestSetPasswordOtp,
    setPassword,
    requestDeleteAccountOtp,
    deleteAccount,
  };
}
