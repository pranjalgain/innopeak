import { useEffect, useState } from "react";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AdminBillingService } from "@/app/_libs/services/admin-billing.service";
import type { BusinessBillingInfo } from "@/types/domain";

interface UseAdminBillingResult {
  billing: BusinessBillingInfo[];
  isLoading: boolean;
}

export function useAdminBilling(): UseAdminBillingResult {
  const t = useTranslations("adminBilling.toasts");
  const [billing, setBilling] = useState<BusinessBillingInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    AdminBillingService.getBilling()
      .then((result) => {
        if (!cancelled) setBilling(result);
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

  return { billing, isLoading };
}
