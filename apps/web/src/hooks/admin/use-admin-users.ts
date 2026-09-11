
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { AdminUserService } from "@/app/_libs/services/admin-user.service";
import type { AdminUser } from "@/types/domain";

export const adminUsersQueryKey = ["admin", "users"] as const;

interface UseAdminUsersResult {
  users: AdminUser[];
  isLoading: boolean;
  toggleActive: (id: string) => Promise<void>;
}

export function useAdminUsers(): UseAdminUsersResult {
  const t = useTranslations("adminUsers.toasts");
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: adminUsersQueryKey,
    queryFn: () => AdminUserService.getUsers(),
  });

  useEffect(() => {
    if (usersQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usersQuery.isError]);

  const toggleActiveMutation = useMutation({
    mutationFn: (id: string) => AdminUserService.toggleActive(id),
  });

  const toggleActive = useCallback(
    async (id: string) => {
      try {
        const updated = await toggleActiveMutation.mutateAsync(id);
        queryClient.setQueryData<AdminUser[]>(adminUsersQueryKey, (prev) =>
          prev?.map((user) => (user.id === id ? updated : user)),
        );
      } catch {
        toast.error(t("updateFailed"));
      }
    },
    [t, toggleActiveMutation, queryClient],
  );

  return {
    users: usersQuery.data ?? [],
    isLoading: usersQuery.isLoading,
    toggleActive,
  };
}
