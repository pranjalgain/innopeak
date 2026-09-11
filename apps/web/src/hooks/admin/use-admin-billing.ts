
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";

import { AdminBillingService } from "@/app/_libs/services/admin-billing.service";
import type { BusinessBillingInfo } from "@/types/domain";

export const adminBillingQueryKey = ["admin", "billing"] as const;

interface UseAdminBillingResult {
  billing: BusinessBillingInfo[];
  isLoading: boolean;
}

export function useAdminBilling(): UseAdminBillingResult {
  const t = useTranslations("adminBilling.toasts");

  const billingQuery = useQuery({
    queryKey: adminBillingQueryKey,
    queryFn: () => AdminBillingService.getBilling(),
  });

  useEffect(() => {
    if (billingQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingQuery.isError]);

  return {
    billing: billingQuery.data ?? [],
    isLoading: billingQuery.isLoading,
  };
}
