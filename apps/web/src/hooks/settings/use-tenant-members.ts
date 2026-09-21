
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
  inviteMember: (email: string) => Promise<boolean>;
  revokeInvite: (id: string) => Promise<void>;
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
        // Appended only when there is a list to append to. `[...(prev ?? []), member]` looked
        // equivalent but silently replaced the whole cache with a one-element array whenever the
        // roster query had failed or not yet loaded — every other member vanished from the screen
        // until a refetch. `undefined` leaves the cache untouched and lets the invalidate below
        // fetch the real list.
        queryClient.setQueryData<TenantMember[]>(tenantMembersQueryKey, (prev) =>
          prev ? [...prev, member] : undefined,
        );
        // Also the only path back to a fresh roster after an invitee accepts elsewhere: nothing
        // pushes that update to the owner's open tab, so without this, the owner's list keeps
        // reading "invited" until `staleTime` (5 min) passes and something else happens to
        // trigger a refetch.
        void queryClient.invalidateQueries({ queryKey: tenantMembersQueryKey });
        toast.success(t("invited", { email }));
        return true;
      } catch (error) {
        // A 4xx here carries copy worth showing as-is — "This email already has a pending
        // invite." tells the owner something actionable that the generic fallback below does not.
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

  return {
    members: membersQuery.data ?? [],
    isLoading: membersQuery.isLoading,
    inviteMember,
    revokeInvite,
  };
}
