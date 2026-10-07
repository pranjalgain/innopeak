
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { AdminUserService } from "@/app/_libs/services/admin-user.service";
import {
  adminOverviewActivityLogQueryKey,
  adminOverviewActivityQueryKey,
  adminUsersQueryKey,
} from "@/hooks/admin/admin-query-keys";
import { useSearchInput } from "@/hooks/common/use-search-input";
import type { AdminUser } from "@/types/domain";

interface UseAdminUsersResult {
  users: AdminUser[];
  search: string;
  setSearch: (search: string) => void;
  /** Whether a search is in effect; comes from the debounced value (see `useAdminBusinesses`). */
  isSearching: boolean;
  isLoading: boolean;
  isError: boolean;
  /** Re-runs the failed query — queries here use `retry: false`, so nothing recovers on its own. */
  refetch: () => void;
  toggleActive: (id: string) => Promise<void>;
}

/** Typing pause before a search reaches the API — same as `useReviewQueue`'s own constant. */
const SEARCH_DEBOUNCE_MS = 300;

const usersQueryKey = (search: string) => [...adminUsersQueryKey, { search }] as const;

/** Searched server-side via `GET /v1/admin/users`'s `search` param. */
export function useAdminUsers(): UseAdminUsersResult {
  const t = useTranslations("adminUsers.toasts");
  const queryClient = useQueryClient();
  const { search, setSearch, debouncedSearch, isSearching } = useSearchInput(SEARCH_DEBOUNCE_MS);

  const usersQuery = useQuery({
    queryKey: usersQueryKey(debouncedSearch),
    queryFn: () => AdminUserService.getUsers({ search: debouncedSearch || undefined }),
    placeholderData: keepPreviousData,
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
        await toggleActiveMutation.mutateAsync(id);
        // The search term is part of the query key, so `setQueryData` can't reach every cached page:
        // invalidate the whole prefix instead.
        void queryClient.invalidateQueries({ queryKey: adminUsersQueryKey });
        // The activity feed (Overview and Activity page) is derived server-side from this write, so both keys go stale.
        void queryClient.invalidateQueries({ queryKey: adminOverviewActivityQueryKey });
        void queryClient.invalidateQueries({ queryKey: adminOverviewActivityLogQueryKey });
      } catch {
        toast.error(t("updateFailed"));
      }
    },
    [t, toggleActiveMutation, queryClient],
  );

  return {
    users: usersQuery.data ?? [],
    search,
    setSearch,
    isSearching,
    // First load only: `isFetching` also flips on every debounced search, and this view swaps its
    // entire content area for a skeleton while true; `keepPreviousData` covers background refetches.
    isLoading: usersQuery.isLoading,
    isError: usersQuery.isError,
    refetch: () => void usersQuery.refetch(),
    toggleActive,
  };
}
