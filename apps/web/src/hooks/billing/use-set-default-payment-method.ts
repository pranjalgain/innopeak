import { useMutation, type UseMutationResult, useQueryClient } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";
import { subscriptionQueryKey } from "@/hooks/billing/use-subscription";

/** Call once Stripe.js confirms the SetupIntent client-side. */
export function useSetDefaultPaymentMethod(): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentMethodId: string) => BillingService.setDefaultPaymentMethod(paymentMethodId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: subscriptionQueryKey });
    },
  });
}
