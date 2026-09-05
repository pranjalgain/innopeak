import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { TenantOwnerProfileService } from "@/app/_libs/services/tenant-owner-profile.service";
import type { TenantOwnerProfile } from "@/types/domain";

interface UseTenantOwnerProfileResult {
  profile: TenantOwnerProfile | null;
  isLoading: boolean;
  updateAvatar: (avatarUrl: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}

export function useTenantOwnerProfile(): UseTenantOwnerProfileResult {
  const t = useTranslations("settings.profile.toasts");
  const [profile, setProfile] = React.useState<TenantOwnerProfile | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    TenantOwnerProfileService.get()
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  const updateAvatar = React.useCallback(
    async (avatarUrl: string) => {
      try {
        const updated = await TenantOwnerProfileService.updateAvatar(avatarUrl);
        setProfile(updated);
        toast.success(t("avatarUpdated"));
      } catch {
        toast.error(t("updateFailed"));
      }
    },
    [t],
  );

  /** Returns whether it succeeded, so the form knows to clear itself. */
  const changePassword = React.useCallback(
    async (currentPassword: string, newPassword: string) => {
      try {
        await TenantOwnerProfileService.changePassword(currentPassword, newPassword);
        toast.success(t("passwordChanged"));
        return true;
      } catch {
        toast.error(t("updateFailed"));
        return false;
      }
    },
    [t],
  );

  return { profile, isLoading, updateAvatar, changePassword };
}
