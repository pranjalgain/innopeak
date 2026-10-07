import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";

/** Dev/test only (404s unless `PAYMENT_PROVIDER=dummy`): applies the transition a real `checkout.session.completed` webhook would, since the Dummy provider has no webhook caller. */
export function useCompleteDummyCheckout(): UseMutationResult<void, unknown, string> {
  return useMutation({
    mutationFn: (subscriptionId: string) => BillingService.completeDummyCheckout(subscriptionId),
  });
}
