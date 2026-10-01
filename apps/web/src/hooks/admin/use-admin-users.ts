
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
  /** Whether a search is currently in effect — see `useAdminBusinesses`'s own comment (same
   *  `useSearchInput` hook, same reasoning) for why this must come from the debounced value. */
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

/**
 * Every user, searched **server-side** — an earlier version loaded the whole cross-tenant list
 * once and filtered it in the browser via `useSearchFilter`. This fetches exactly the matching
 * rows using `GET /v1/admin/users`'s own `search` param, rather than shipping every user to the
 * browser just to filter most of them back out.
 */
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
        // The search term is now part of the query key, so a single `setQueryData` can no longer
        // reach every cached page this user might appear under — invalidating the whole
        // `adminUsersQueryKey` prefix refetches all of them instead, current search included.
        void queryClient.invalidateQueries({ queryKey: adminUsersQueryKey });
        // The activity feed (both the Overview glance card and the dedicated, paginated Activity
        // page) is derived server-side from this write, so the cached copy of each is stale the
        // moment the mutation succeeds. Without both invalidations, one or the other omitted the
        // entry that had just been written until its own staleTime elapsed.
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
    // The genuine first load only (no cached data yet) — `usersQuery.isFetching` would also flip
    // true on every debounced search, and this view swaps its *entire* content area (search bar
    // and result count included, not just the rows) to a full skeleton whenever this is true.
    // `placeholderData: keepPreviousData` already keeps the previous rows on screen while a search
    // is in flight, so a background refetch needs no loading state of its own here.
    isLoading: usersQuery.isLoading,
    isError: usersQuery.isError,
    refetch: () => void usersQuery.refetch(),
    toggleActive,
  };
}
