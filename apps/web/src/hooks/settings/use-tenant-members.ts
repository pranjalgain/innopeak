import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { TenantMemberService } from "@/app/_libs/services/tenant-member.service";
import type { TenantMember } from "@/types/domain";

interface UseTenantMembersResult {
  members: TenantMember[];
  isLoading: boolean;
  inviteMember: (email: string) => Promise<boolean>;
  revokeInvite: (id: string) => Promise<void>;
}

export function useTenantMembers(): UseTenantMembersResult {
  const t = useTranslations("settings.members.toasts");
  const [members, setMembers] = React.useState<TenantMember[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    TenantMemberService.getMembers()
      .then((result) => {
        if (!cancelled) setMembers(result);
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
  const inviteMember = React.useCallback(
    async (email: string) => {
      try {
        const member = await TenantMemberService.inviteMember(email);
        setMembers((prev) => [...prev, member]);
        toast.success(t("invited", { email }));
        return true;
      } catch {
        toast.error(t("inviteFailed"));
        return false;
      }
    },
    [t],
  );

  const revokeInvite = React.useCallback(
    async (id: string) => {
      try {
        await TenantMemberService.revokeInvite(id);
        setMembers((prev) => prev.filter((member) => member.id !== id));
        toast.success(t("revoked"));
      } catch {
        toast.error(t("revokeFailed"));
      }
    },
    [t],
  );

  return { members, isLoading, inviteMember, revokeInvite };
}
