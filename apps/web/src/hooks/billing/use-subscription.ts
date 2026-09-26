import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";
import type { Subscription } from "@/types/domain";

export const subscriptionQueryKey = ["billing", "subscription"] as const;

/**
 * `GET /v1/billing/subscription` — current plan, Stripe subscription state (if any), and live
 * entitlement usage against the plan. Owner-only on the backend.
 *
 * `enabled` (default `true`) gates the underlying query — same convention as `useSettings` — for
 * a caller that would otherwise fire this for a `member`, who gets a 403 from the backend's own
 * `@Roles(UserRole.OWNER)` guard.
 */
export function useSubscription(enabled = true): UseQueryResult<Subscription> {
  return useQuery({
    queryKey: subscriptionQueryKey,
    queryFn: () => BillingService.getSubscription(),
    enabled,
  });
}
