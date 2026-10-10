
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
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
  /** The current page only; the server pages and counts (`totalPages`). */
  businesses: AdminBusiness[];
  page: number;
  totalPages: number;
  /** Every match across all pages, for the result count. */
  total: number;
  goToPreviousPage: () => void;
  goToNextPage: () => void;
  search: string;
  setSearch: (search: string) => void;
  /** Derived from the trimmed, debounced value the query is keyed on, so it never disagrees with `businesses`. */
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

const PAGE_SIZE = 10;

const businessesQueryKey = (search: string, page: number) =>
  [...adminBusinessesQueryKey, { search, page }] as const;

/** Searched server-side via `GET /v1/admin/businesses`'s `search` param. */
export function useAdminBusinesses(): UseAdminBusinessesResult {
  const t = useTranslations("adminBusinesses.toasts");
  const queryClient = useQueryClient();
  const { search, setSearch, debouncedSearch, isSearching } = useSearchInput(SEARCH_DEBOUNCE_MS);
  const [page, setPageState] = useState(1);

  // A new search can leave the current page out of range: start again from page 1.
  const [lastSearch, setLastSearch] = useState(debouncedSearch);
  if (lastSearch !== debouncedSearch) {
    setLastSearch(debouncedSearch);
    setPageState(1);
  }

  const businessesQuery = useQuery({
    queryKey: businessesQueryKey(debouncedSearch, page),
    queryFn: () =>
      AdminBusinessService.getBusinesses({
        search: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const totalPages = Math.max(1, businessesQuery.data?.meta.totalPages ?? 1);
  const setPage = useCallback(
    (next: number) => setPageState(Math.min(Math.max(next, 1), totalPages)),
    [totalPages],
  );

  useEffect(() => {
    if (businessesQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessesQuery.isError]);

  const setStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AdminBusiness["status"] }) =>
      AdminBusinessService.setStatus(id, status),
  });

  // The search term is part of the query key, so `setQueryData` can't reach every cached page:
  // invalidate the whole prefix instead. Both activity feed keys are derived from these writes too.
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
    businesses: businessesQuery.data?.businesses ?? [],
    page,
    totalPages,
    total: businessesQuery.data?.meta.total ?? 0,
    goToPreviousPage: () => setPage(page - 1),
    goToNextPage: () => setPage(page + 1),
    search,
    setSearch,
    isSearching,
    // First load only: `isFetching` also flips on every debounced search, and this view swaps its
    // entire content area for a skeleton while true; `keepPreviousData` covers background refetches.
    isLoading: businessesQuery.isLoading,
    isError: businessesQuery.isError,
    refetch: () => void businessesQuery.refetch(),
    suspendBusiness,
    reactivateBusiness,
    requestErasure,
    cancelErasure,
  };
}
