
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { TenantMemberService } from "@/app/_libs/services/tenant-member.service";
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
        queryClient.setQueryData<TenantMember[]>(tenantMembersQueryKey, (prev) => [
          ...(prev ?? []),
          member,
        ]);
        toast.success(t("invited", { email }));
        return true;
      } catch {
        toast.error(t("inviteFailed"));
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
        toast.success(t("revoked"));
      } catch {
        toast.error(t("revokeFailed"));
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
