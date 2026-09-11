
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { AdminBusinessService } from "@/app/_libs/services/admin-business.service";
import type { AdminBusiness } from "@/types/domain";

export const adminBusinessesQueryKey = ["admin", "businesses"] as const;

interface UseAdminBusinessesResult {
  businesses: AdminBusiness[];
  isLoading: boolean;
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
    suspendBusiness,
    reactivateBusiness,
  };
}
