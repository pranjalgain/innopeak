
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { PlatformAdminInviteService } from "@/app/_libs/services/platform-admin-invite.service";
import {
  adminOverviewActivityLogQueryKey,
  adminOverviewActivityQueryKey,
} from "@/hooks/admin/admin-query-keys";
import { toastApiError } from "@/hooks/common/toast-api-error";
import type { PlatformAdminInvite } from "@/types/domain";

export const platformAdminInvitesQueryKey = ["admin", "platform-admin-invites"] as const;

interface UsePlatformAdminInvitesResult {
  invites: PlatformAdminInvite[];
  isLoading: boolean;
  isError: boolean;
  /** Re-runs the failed query — queries here use `retry: false`, so nothing recovers on its own. */
  refetch: () => void;
  sendInvite: (email: string) => Promise<boolean>;
  revokeInvite: (id: string) => Promise<void>;
  /** Disable (`enabled: false`) or re-enable an accepted admin. */
  setAdminStatus: (id: string, enabled: boolean) => Promise<void>;
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
        // Append only when there is a list: `[...(prev ?? []), invite]` would replace the cache with a
        // one-element array if the roster query had failed or not loaded. `undefined` leaves it untouched.
        queryClient.setQueryData<PlatformAdminInvite[]>(platformAdminInvitesQueryKey, (prev) =>
          prev ? [...prev, invite] : undefined,
        );
        void queryClient.invalidateQueries({ queryKey: platformAdminInvitesQueryKey });
        void queryClient.invalidateQueries({ queryKey: adminOverviewActivityQueryKey });
        void queryClient.invalidateQueries({ queryKey: adminOverviewActivityLogQueryKey });
        toast.success(t("sent", { email }));
        return true;
      } catch (error) {
        // A 409 (already invited) carries a specific reason worth showing.
        toastApiError(error, { 400: null, 409: null }, t("sendFailed"));
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
        void queryClient.invalidateQueries({ queryKey: adminOverviewActivityQueryKey });
        void queryClient.invalidateQueries({ queryKey: adminOverviewActivityLogQueryKey });
        toast.success(t("revoked"));
      } catch (error) {
        // A 409 (already accepted, no longer revocable) carries a specific reason worth showing.
        toastApiError(error, { 400: null, 409: null }, t("revokeFailed"));
      }
    },
    [t, revokeInviteMutation, queryClient],
  );

  const setAdminStatusMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      PlatformAdminInviteService.setAdminStatus(id, enabled),
  });

  const setAdminStatus = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        const updated = await setAdminStatusMutation.mutateAsync({ id, enabled });
        queryClient.setQueryData<PlatformAdminInvite[]>(platformAdminInvitesQueryKey, (prev) =>
          prev?.map((invite) => (invite.id === id ? { ...invite, status: updated.status } : invite)),
        );
        // Server-recorded to the activity feed, which both the Overview and Activity pages read.
        void queryClient.invalidateQueries({ queryKey: adminOverviewActivityQueryKey });
        void queryClient.invalidateQueries({ queryKey: adminOverviewActivityLogQueryKey });
        toast.success(enabled ? t("adminEnabled") : t("adminDisabled"));
      } catch (error) {
        // A 400 (last-active / self) or 409 (invited) carries a specific reason worth showing.
        toastApiError(error, { 400: null, 409: null }, t("updateFailed"));
      }
    },
    [t, setAdminStatusMutation, queryClient],
  );

  return {
    invites: invitesQuery.data ?? [],
    isLoading: invitesQuery.isLoading,
    isError: invitesQuery.isError,
    refetch: () => void invitesQuery.refetch(),
    sendInvite,
    revokeInvite,
    setAdminStatus,
  };
}
