import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";
import type { Subscription } from "@/types/domain";

export const subscriptionQueryKey = ["billing", "subscription"] as const;

/** Owner-only on the backend: pass `enabled = false` for a `member`, who would get a 403. */
export function useSubscription(enabled = true): UseQueryResult<Subscription> {
  return useQuery({
    queryKey: subscriptionQueryKey,
    queryFn: () => BillingService.getSubscription(),
    enabled,
  });
}
