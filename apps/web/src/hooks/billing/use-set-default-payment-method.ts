import { useMutation, type UseMutationResult, useQueryClient } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";
import { subscriptionQueryKey } from "@/hooks/billing/use-subscription";

/** Call once Stripe.js confirms the SetupIntent client-side — makes the new card the one
 *  `getSubscription().paymentMethod` shows, then invalidates that query so the masked-card display
 *  in Settings → Billing reflects it without a manual refresh. */
export function useSetDefaultPaymentMethod(): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentMethodId: string) => BillingService.setDefaultPaymentMethod(paymentMethodId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: subscriptionQueryKey });
    },
  });
}
