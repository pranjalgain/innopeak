import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";
import type { BillingProfile } from "@/types/domain";

export const billingProfileQueryKey = ["billing", "profile"] as const;

/** `GET /v1/billing/profile`. */
export function useBillingProfile(enabled: boolean): UseQueryResult<BillingProfile> {
  return useQuery({
    queryKey: billingProfileQueryKey,
    queryFn: () => BillingService.getBillingProfile(),
    enabled,
  });
}
