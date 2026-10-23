
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { TenantMemberService } from "@/app/_libs/services/tenant-member.service";
import { authErrorMessage } from "@/hooks/auth/use-auth";
import type { TenantMember } from "@/types/domain";

export const tenantMembersQueryKey = ["tenant-members"] as const;

interface UseTenantMembersResult {
  members: TenantMember[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  inviteMember: (email: string) => Promise<boolean>;
  revokeInvite: (id: string) => Promise<void>;
  requestRemoval: (id: string) => Promise<void>;
  cancelRemoval: (id: string) => Promise<void>;
}

export function useTenantMembers(): UseTenantMembersResult {
  const t = useTranslations("settings.members.toasts");
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: tenantMembersQueryKey,
    queryFn: () => TenantMemberService.getMembers(),
  });

  useEffect(() => {
    if (membersQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersQuery.isError]);

  const inviteMemberMutation = useMutation({
    mutationFn: (email: string) => TenantMemberService.inviteMember(email),
  });

  /** Returns whether it succeeded, so the form knows to clear itself. */
  const inviteMember = useCallback(
    async (email: string) => {
      try {
        const member = await inviteMemberMutation.mutateAsync(email);
        // Appended only when there is a list: `[...(prev ?? []), member]` would replace the cache
        // with a one-element array if the roster query had failed or not loaded. `undefined` leaves
        // the cache untouched and lets the invalidate fetch the real list.
        queryClient.setQueryData<TenantMember[]>(tenantMembersQueryKey, (prev) =>
          prev ? [...prev, member] : undefined,
        );
        // Also the only way to refresh after an invitee accepts elsewhere: nothing pushes that to
        // the owner's open tab, so the list would read "invited" until `staleTime` (5 min) passes.
        void queryClient.invalidateQueries({ queryKey: tenantMembersQueryKey });
        toast.success(t("invited", { email }));
        return true;
      } catch (error) {
        // A 4xx carries actionable copy ("This email already has a pending invite.") worth showing
        // as-is, unlike the generic fallback below.
        toast.error(authErrorMessage(error, t("inviteFailed")));
        return false;
      }
    },
    [t, inviteMemberMutation, queryClient],
  );

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) => TenantMemberService.revokeInvite(id),
  });

  const revokeInvite = useCallback(
    async (id: string) => {
      try {
        await revokeInviteMutation.mutateAsync(id);
        queryClient.setQueryData<TenantMember[]>(
          tenantMembersQueryKey,
          (prev) => prev?.filter((member) => member.id !== id) ?? prev,
        );
        void queryClient.invalidateQueries({ queryKey: tenantMembersQueryKey });
        toast.success(t("revoked"));
      } catch (error) {
        toast.error(authErrorMessage(error, t("revokeFailed")));
      }
    },
    [t, revokeInviteMutation, queryClient],
  );

  const requestRemovalMutation = useMutation({
    mutationFn: (id: string) => TenantMemberService.requestRemoval(id),
  });

  /**
   * The success toast uses the server's message: it interpolates the configured grace-period day
   * count, which this hook cannot know.
   */
  const requestRemoval = useCallback(
    async (id: string) => {
      try {
        const message = await requestRemovalMutation.mutateAsync(id);
        void queryClient.invalidateQueries({ queryKey: tenantMembersQueryKey });
        toast.success(message);
      } catch (error) {
        toast.error(authErrorMessage(error, t("requestRemovalFailed")));
      }
    },
    [t, requestRemovalMutation, queryClient],
  );

  const cancelRemovalMutation = useMutation({
    mutationFn: (id: string) => TenantMemberService.cancelRemoval(id),
  });

  const cancelRemoval = useCallback(
    async (id: string) => {
      try {
        await cancelRemovalMutation.mutateAsync(id);
        void queryClient.invalidateQueries({ queryKey: tenantMembersQueryKey });
        toast.success(t("removalCancelled"));
      } catch (error) {
        toast.error(authErrorMessage(error, t("cancelRemovalFailed")));
      }
    },
    [t, cancelRemovalMutation, queryClient],
  );

  return {
    members: membersQuery.data ?? [],
    isLoading: membersQuery.isLoading,
    // A failed *refresh* keeps the list (and a half-typed invite) on screen; only a load that left nothing is an error screen.
    isError: membersQuery.isError && membersQuery.data === undefined,
    refetch: () => void membersQuery.refetch(),
    inviteMember,
    revokeInvite,
    requestRemoval,
    cancelRemoval,
  };
}
