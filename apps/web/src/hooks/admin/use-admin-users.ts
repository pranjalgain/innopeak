
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { AdminUserService } from "@/app/_libs/services/admin-user.service";
import { adminOverviewActivityQueryKey, adminUsersQueryKey } from "@/hooks/admin/admin-query-keys";
import type { AdminUser } from "@/types/domain";

interface UseAdminUsersResult {
  users: AdminUser[];
  isLoading: boolean;
  isError: boolean;
  /** Re-runs the failed query — queries here use `retry: false`, so nothing recovers on its own. */
  refetch: () => void;
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
        // The activity feed is derived server-side from this write, so the cached copy is stale the
        // moment the mutation succeeds. `setQueryData` above keeps the row's own flip instant;
        // this refetches what only the server can recompute. Without it the Overview's Activity
        // card omitted the entry that had just been written, for the whole 5-minute staleTime.
        void queryClient.invalidateQueries({ queryKey: adminOverviewActivityQueryKey });
      } catch {
        toast.error(t("updateFailed"));
      }
    },
    [t, toggleActiveMutation, queryClient],
  );

  return {
    users: usersQuery.data ?? [],
    isLoading: usersQuery.isLoading,
    isError: usersQuery.isError,
    refetch: () => void usersQuery.refetch(),
    toggleActive,
  };
}
