
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
import { useUrlSearchPage } from "@/hooks/common/use-url-search-page";
import type { AdminUser } from "@/types/domain";

interface UseAdminUsersResult {
  /** The current page only; the server pages and counts (`totalPages`). */
  users: AdminUser[];
  page: number;
  totalPages: number;
  /** Every match across all pages, for the result count. */
  total: number;
  goToPreviousPage: () => void;
  goToNextPage: () => void;
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

const PAGE_SIZE = 10;

const usersQueryKey = (search: string, page: number) =>
  [...adminUsersQueryKey, { search, page }] as const;

/** Searched server-side via `GET /v1/admin/users`'s `search` param. */
export function useAdminUsers(): UseAdminUsersResult {
  const t = useTranslations("adminUsers.toasts");
  const queryClient = useQueryClient();
  // Page and search live in the URL (`?page=2&q=term`), so Back/Forward and a reload keep your place.
  const { search, setSearch, debouncedSearch, isSearching, page, setPage, clampPage } =
    useUrlSearchPage(SEARCH_DEBOUNCE_MS);

  const usersQuery = useQuery({
    queryKey: usersQueryKey(debouncedSearch, page),
    queryFn: () =>
      AdminUserService.getUsers({
        search: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const totalPages = Math.max(1, usersQuery.data?.meta.totalPages ?? 1);
  const goToPage = useCallback(
    (next: number) => setPage(Math.min(Math.max(next, 1), totalPages)),
    [setPage, totalPages],
  );

  // A stale `?page=` (an old link, a list that shrank) is pulled back to the last real page.
  useEffect(() => {
    if (usersQuery.data) clampPage(totalPages);
  }, [usersQuery.data, totalPages, clampPage]);

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
    users: usersQuery.data?.users ?? [],
    page,
    totalPages,
    total: usersQuery.data?.meta.total ?? 0,
    goToPreviousPage: () => goToPage(page - 1),
    goToNextPage: () => goToPage(page + 1),
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
