import { useMutation, type UseMutationResult, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/app/_libs/services/api-error";
import { BillingService } from "@/app/_libs/services/billing.service";
import { subscriptionQueryKey } from "@/hooks/billing/use-subscription";
import type { Subscription } from "@/types/domain";

/**
 * Writes the returned subscription straight into the cache instead of invalidating, so the Billing
 * tab shows "Paid" without a refetch round trip.
 *
 * Retries twice because the caller strips the success-URL params once the request settles: a transient
 * failure must not cost the user their only chance to reconcile. A 4xx is an answer, not a blip (the
 * session isn't this business's), so it settles at once.
 */
export function useReconcileCheckoutSession(): UseMutationResult<Subscription, unknown, string> {
  const queryClient = useQueryClient();

  return useMutation({
    retry: (failureCount, error) =>
      failureCount < 2 &&
      !(error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500),
    mutationFn: (checkoutSessionId: string) =>
      BillingService.reconcileCheckoutSession(checkoutSessionId),
    onSuccess: (subscription) => {
      queryClient.setQueryData(subscriptionQueryKey, subscription);
    },
  });
}
