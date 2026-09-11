
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { PlatformAdminInviteService } from "@/app/_libs/services/platform-admin-invite.service";
import type { PlatformAdminInvite } from "@/types/domain";

export const platformAdminInvitesQueryKey = ["admin", "platform-admin-invites"] as const;

interface UsePlatformAdminInvitesResult {
  invites: PlatformAdminInvite[];
  isLoading: boolean;
  sendInvite: (email: string) => Promise<boolean>;
  revokeInvite: (id: string) => Promise<void>;
}

export function usePlatformAdminInvites(): UsePlatformAdminInvitesResult {
  const t = useTranslations("adminSettings.invite.toasts");
  const queryClient = useQueryClient();

  const invitesQuery = useQuery({
    queryKey: platformAdminInvitesQueryKey,
    queryFn: () => PlatformAdminInviteService.getInvites(),
  });

  useEffect(() => {
    if (invitesQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitesQuery.isError]);

  const sendInviteMutation = useMutation({
    mutationFn: (email: string) => PlatformAdminInviteService.sendInvite(email),
  });

  /** Returns whether it succeeded, so the form knows to clear itself. */
  const sendInvite = useCallback(
    async (email: string) => {
      try {
        const invite = await sendInviteMutation.mutateAsync(email);
        queryClient.setQueryData<PlatformAdminInvite[]>(platformAdminInvitesQueryKey, (prev) => [
          ...(prev ?? []),
          invite,
        ]);
        toast.success(t("sent", { email }));
        return true;
      } catch {
        toast.error(t("sendFailed"));
        return false;
      }
    },
    [t, sendInviteMutation, queryClient],
  );

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) => PlatformAdminInviteService.revokeInvite(id),
  });

  const revokeInvite = useCallback(
    async (id: string) => {
      try {
        await revokeInviteMutation.mutateAsync(id);
        queryClient.setQueryData<PlatformAdminInvite[]>(
          platformAdminInvitesQueryKey,
          (prev) => prev?.filter((invite) => invite.id !== id) ?? prev,
        );
        toast.success(t("revoked"));
      } catch {
        toast.error(t("revokeFailed"));
      }
    },
    [t, revokeInviteMutation, queryClient],
  );

  return {
    invites: invitesQuery.data ?? [],
    isLoading: invitesQuery.isLoading,
    sendInvite,
    revokeInvite,
  };
}
