
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { AdminBusinessService } from "@/app/_libs/services/admin-business.service";
import {
  adminBusinessesQueryKey,
  adminOverviewActivityQueryKey,
} from "@/hooks/admin/admin-query-keys";
import type { AdminBusiness } from "@/types/domain";

interface UseAdminBusinessesResult {
  businesses: AdminBusiness[];
  isLoading: boolean;
  isError: boolean;
  /** Re-runs the failed query — queries here use `retry: false`, so nothing recovers on its own. */
  refetch: () => void;
  suspendBusiness: (id: string) => Promise<void>;
  reactivateBusiness: (id: string) => Promise<void>;
}

/** Loads every business once — fine at this data volume, same as `useReviewQueue`. */
export function useAdminBusinesses(): UseAdminBusinessesResult {
  const t = useTranslations("adminBusinesses.toasts");
  const queryClient = useQueryClient();

  const businessesQuery = useQuery({
    queryKey: adminBusinessesQueryKey,
    queryFn: () => AdminBusinessService.getBusinesses(),
  });

  useEffect(() => {
    if (businessesQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessesQuery.isError]);

  const setStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AdminBusiness["status"] }) =>
      AdminBusinessService.setStatus(id, status),
  });

  const setStatus = useCallback(
    async (id: string, status: AdminBusiness["status"]) => {
      try {
        const updated = await setStatusMutation.mutateAsync({ id, status });
        queryClient.setQueryData<AdminBusiness[]>(adminBusinessesQueryKey, (prev) =>
          prev?.map((business) => (business.id === id ? updated : business)),
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
    [t, setStatusMutation, queryClient],
  );

  const suspendBusiness = useCallback((id: string) => setStatus(id, "suspended"), [setStatus]);
  const reactivateBusiness = useCallback((id: string) => setStatus(id, "active"), [setStatus]);

  return {
    businesses: businessesQuery.data ?? [],
    isLoading: businessesQuery.isLoading,
    isError: businessesQuery.isError,
    refetch: () => void businessesQuery.refetch(),
    suspendBusiness,
    reactivateBusiness,
  };
}
