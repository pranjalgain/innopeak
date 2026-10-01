
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { AdminBusinessService } from "@/app/_libs/services/admin-business.service";
import {
  adminBusinessesQueryKey,
  adminOverviewActivityLogQueryKey,
  adminOverviewActivityQueryKey,
} from "@/hooks/admin/admin-query-keys";
import { useSearchInput } from "@/hooks/common/use-search-input";
import type { AdminBusiness } from "@/types/domain";

interface UseAdminBusinessesResult {
  businesses: AdminBusiness[];
  search: string;
  setSearch: (search: string) => void;
  /** Whether a search is currently in effect — derived from the exact (trimmed, debounced) value
   *  the query itself is keyed on, not the raw input, so this can never disagree with what
   *  `businesses` actually reflects (see `useSearchInput`'s own comment for why that matters). */
  isSearching: boolean;
  isLoading: boolean;
  isError: boolean;
  /** Re-runs the failed query — queries here use `retry: false`, so nothing recovers on its own. */
  refetch: () => void;
  suspendBusiness: (id: string) => Promise<void>;
  reactivateBusiness: (id: string) => Promise<void>;
  requestErasure: (id: string) => Promise<void>;
  cancelErasure: (id: string) => Promise<void>;
}

/** Typing pause before a search reaches the API — same as `useReviewQueue`'s own constant. */
const SEARCH_DEBOUNCE_MS = 300;

const businessesQueryKey = (search: string) => [...adminBusinessesQueryKey, { search }] as const;

/**
 * Every business, searched **server-side** — an earlier version loaded the whole list once and
 * filtered it in the browser via `useSearchFilter`. This fetches exactly the matching rows using
 * `GET /v1/admin/businesses`'s own `search` param, rather than shipping every tenant to the
 * browser just to filter most of them back out.
 */
export function useAdminBusinesses(): UseAdminBusinessesResult {
  const t = useTranslations("adminBusinesses.toasts");
  const queryClient = useQueryClient();
  const { search, setSearch, debouncedSearch, isSearching } = useSearchInput(SEARCH_DEBOUNCE_MS);

  const businessesQuery = useQuery({
    queryKey: businessesQueryKey(debouncedSearch),
    queryFn: () => AdminBusinessService.getBusinesses({ search: debouncedSearch || undefined }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (businessesQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessesQuery.isError]);

  const setStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AdminBusiness["status"] }) =>
      AdminBusinessService.setStatus(id, status),
  });

  // Shared by every mutation below: the search term is part of the query key, so a single
  // `setQueryData` can no longer reach every cached page a business might appear under —
  // invalidating the whole `adminBusinessesQueryKey` prefix refetches all of them instead,
  // current search included. The activity feed (both the Overview glance card and the dedicated,
  // paginated Activity page) is derived server-side from these writes too, so both of its query
  // keys need invalidating as well — omitting either left it stale until its own staleTime elapsed.
  const invalidateAfterWrite = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: adminBusinessesQueryKey });
    void queryClient.invalidateQueries({ queryKey: adminOverviewActivityQueryKey });
    void queryClient.invalidateQueries({ queryKey: adminOverviewActivityLogQueryKey });
  }, [queryClient]);

  const setStatus = useCallback(
    async (id: string, status: AdminBusiness["status"]) => {
      try {
        await setStatusMutation.mutateAsync({ id, status });
        invalidateAfterWrite();
      } catch {
        toast.error(t("updateFailed"));
      }
    },
    [t, setStatusMutation, invalidateAfterWrite],
  );

  const suspendBusiness = useCallback((id: string) => setStatus(id, "suspended"), [setStatus]);
  const reactivateBusiness = useCallback((id: string) => setStatus(id, "active"), [setStatus]);

  const requestErasureMutation = useMutation({
    mutationFn: (id: string) => AdminBusinessService.requestErasure(id),
  });

  const requestErasure = useCallback(
    async (id: string) => {
      try {
        await requestErasureMutation.mutateAsync(id);
        invalidateAfterWrite();
      } catch {
        toast.error(t("requestErasureFailed"));
      }
    },
    [t, requestErasureMutation, invalidateAfterWrite],
  );

  const cancelErasureMutation = useMutation({
    mutationFn: (id: string) => AdminBusinessService.cancelErasure(id),
  });

  const cancelErasure = useCallback(
    async (id: string) => {
      try {
        await cancelErasureMutation.mutateAsync(id);
        invalidateAfterWrite();
      } catch {
        toast.error(t("cancelErasureFailed"));
      }
    },
    [t, cancelErasureMutation, invalidateAfterWrite],
  );

  return {
    businesses: businessesQuery.data ?? [],
    search,
    setSearch,
    isSearching,
    // The genuine first load only (no cached data yet) — `businessesQuery.isFetching` would also
    // flip true on every debounced search, and this view swaps its *entire* content area (search
    // bar and result count included, not just the rows) to a full skeleton whenever this is true.
    // `placeholderData: keepPreviousData` already keeps the previous rows on screen while a search
    // is in flight, so a background refetch needs no loading state of its own here.
    isLoading: businessesQuery.isLoading,
    isError: businessesQuery.isError,
    refetch: () => void businessesQuery.refetch(),
    suspendBusiness,
    reactivateBusiness,
    requestErasure,
    cancelErasure,
  };
}
