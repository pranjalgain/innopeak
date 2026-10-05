import { useMutation, type UseMutationResult, useQueryClient } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";
import { subscriptionQueryKey } from "@/hooks/billing/use-subscription";
import type { Subscription } from "@/types/domain";

/**
 * `POST /v1/billing/checkout/reconcile` — see `BillingService.reconcileCheckoutSession`'s own doc
 * comment. On success, writes the refreshed subscription straight into the query cache (the
 * response already carries it) rather than merely invalidating — the Billing tab reflects "Paid"
 * on the very next render instead of waiting on a refetch round trip.
 *
 * `retry: 2` (react-query's default backoff: 1s, then 2s) because the caller strips the success-URL
 * params once the request settles — a transient network/5xx failure should not cost the user their
 * only chance to reconcile from this page.
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
