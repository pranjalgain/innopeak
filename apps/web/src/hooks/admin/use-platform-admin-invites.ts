import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { PlatformAdminInviteService } from "@/app/_libs/services/platform-admin-invite.service";
import type { PlatformAdminInvite } from "@/types/domain";

interface UsePlatformAdminInvitesResult {
  invites: PlatformAdminInvite[];
  isLoading: boolean;
  sendInvite: (email: string) => Promise<boolean>;
  revokeInvite: (id: string) => Promise<void>;
}

export function usePlatformAdminInvites(): UsePlatformAdminInvitesResult {
  const t = useTranslations("adminSettings.invite.toasts");
  const [invites, setInvites] = React.useState<PlatformAdminInvite[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    PlatformAdminInviteService.getInvites()
      .then((result) => {
        if (!cancelled) setInvites(result);
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

  /** Returns whether it succeeded, so the form knows to clear itself. */
  const sendInvite = React.useCallback(
    async (email: string) => {
      try {
        const invite = await PlatformAdminInviteService.sendInvite(email);
        setInvites((prev) => [...prev, invite]);
        toast.success(t("sent", { email }));
        return true;
      } catch {
        toast.error(t("sendFailed"));
        return false;
      }
    },
    [t],
  );

  const revokeInvite = React.useCallback(
    async (id: string) => {
      try {
        await PlatformAdminInviteService.revokeInvite(id);
        setInvites((prev) => prev.filter((invite) => invite.id !== id));
        toast.success(t("revoked"));
      } catch {
        toast.error(t("revokeFailed"));
      }
    },
    [t],
  );

  return { invites, isLoading, sendInvite, revokeInvite };
}
