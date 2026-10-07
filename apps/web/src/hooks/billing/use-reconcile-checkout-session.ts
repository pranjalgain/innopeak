import { useMutation, type UseMutationResult, useQueryClient } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";
import { subscriptionQueryKey } from "@/hooks/billing/use-subscription";
import type { Subscription } from "@/types/domain";

/**
 * Writes the returned subscription straight into the cache instead of invalidating, so the Billing
 * tab shows "Paid" without a refetch round trip.
 *
 * `retry: 2` because the caller strips the success-URL params once the request settles: a transient
 * failure must not cost the user their only chance to reconcile.
 */
export function useReconcileCheckoutSession(): UseMutationResult<Subscription, unknown, string> {
  const queryClient = useQueryClient();

  return useMutation({
    retry: 2,
    mutationFn: (checkoutSessionId: string) =>
      BillingService.reconcileCheckoutSession(checkoutSessionId),
    onSuccess: (subscription) => {
      queryClient.setQueryData(subscriptionQueryKey, subscription);
    },
  });
}
