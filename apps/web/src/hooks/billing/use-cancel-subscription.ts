import { useMutation, type UseMutationResult, useQueryClient } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";
import { subscriptionQueryKey } from "@/hooks/billing/use-subscription";

/**
 * `POST /v1/billing/cancel` — in-app cancellation, works the same for every payment provider.
 * Invalidates the subscription query on success so `cancelAtPeriodEnd` reflects immediately for
 * callers that stay on the page (the Dummy portal page instead does a full redirect, which
 * refetches on load anyway).
 *
 * For the real Stripe provider, this call only asks Stripe to cancel — `cancelAtPeriodEnd` in
 * `tenant_subscriptions` doesn't flip until Stripe's own `customer.subscription.updated` webhook
 * is delivered and processed, which can land a moment after this call already returned. The
 * immediate invalidate above can still refetch the pre-cancel state in that gap; this second,
 * delayed invalidate catches the common case where the webhook lands within a couple of seconds,
 * without polling indefinitely. `BillingSettingsSection` also hides the Cancel button itself as
 * soon as this mutation succeeds (not just once the refetch confirms it), so the gap can't be used
 * to fire a second cancel.
 */
export function useCancelSubscription(): UseMutationResult<void, unknown, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => BillingService.cancelSubscription(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: subscriptionQueryKey });
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: subscriptionQueryKey });
      }, 2500);
    },
  });
}
