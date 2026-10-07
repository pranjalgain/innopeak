import { useMutation, type UseMutationResult, useQueryClient } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";
import { subscriptionQueryKey } from "@/hooks/billing/use-subscription";

/**
 * Invalidates twice: with real Stripe, `cancelAtPeriodEnd` only flips when the
 * `customer.subscription.updated` webhook lands, which can be after this call returns, so the
 * delayed invalidate catches the common case without polling. `BillingSettingsSection` also hides
 * the Cancel button as soon as this succeeds, so the gap can't be used to fire a second cancel.
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
