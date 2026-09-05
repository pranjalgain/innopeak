import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { AdminBusinessService } from "@/app/_libs/services/admin-business.service";
import type { AdminBusiness } from "@/types/domain";

interface UseAdminBusinessesResult {
  businesses: AdminBusiness[];
  isLoading: boolean;
  suspendBusiness: (id: string) => Promise<void>;
  reactivateBusiness: (id: string) => Promise<void>;
}

/** Loads every business once — fine at this data volume, same as `useReviewQueue`. */
export function useAdminBusinesses(): UseAdminBusinessesResult {
  const t = useTranslations("adminBusinesses.toasts");
  const [businesses, setBusinesses] = React.useState<AdminBusiness[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    AdminBusinessService.getBusinesses()
      .then((result) => {
        if (!cancelled) setBusinesses(result);
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

  const setStatus = React.useCallback(
    async (id: string, status: AdminBusiness["status"]) => {
      try {
        const updated = await AdminBusinessService.setStatus(id, status);
        setBusinesses((prev) => prev.map((business) => (business.id === id ? updated : business)));
      } catch {
        toast.error(t("updateFailed"));
      }
    },
    [t],
  );

  const suspendBusiness = React.useCallback((id: string) => setStatus(id, "suspended"), [setStatus]);
  const reactivateBusiness = React.useCallback((id: string) => setStatus(id, "active"), [setStatus]);

  return { businesses, isLoading, suspendBusiness, reactivateBusiness };
}
