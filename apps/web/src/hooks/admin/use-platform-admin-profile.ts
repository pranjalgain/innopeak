import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { PlatformAdminProfileService } from "@/app/_libs/services/platform-admin-profile.service";
import type { PlatformAdminProfile } from "@/types/domain";

interface UsePlatformAdminProfileResult {
  profile: PlatformAdminProfile | null;
  isLoading: boolean;
  updateAvatar: (avatarUrl: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}

export function usePlatformAdminProfile(): UsePlatformAdminProfileResult {
  const t = useTranslations("adminSettings.profile.toasts");
  const [profile, setProfile] = React.useState<PlatformAdminProfile | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    PlatformAdminProfileService.get()
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
        const updated = await PlatformAdminProfileService.updateAvatar(avatarUrl);
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
        await PlatformAdminProfileService.changePassword(currentPassword, newPassword);
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
