import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";

/**
 * `POST /v1/billing/dummy/complete-checkout` — dev/test only (404s unless
 * `PAYMENT_PROVIDER=dummy`). Called by the Dummy checkout confirmation page
 * (`app/(auth)/billing/dummy-checkout/page.tsx`) to apply the same state transition a real
 * Stripe `checkout.session.completed` webhook would, since `DummyPaymentProvider` has no external
 * webhook caller of its own to deliver one.
 */
export function useCompleteDummyCheckout(): UseMutationResult<void, unknown, string> {
  return useMutation({
    mutationFn: (subscriptionId: string) => BillingService.completeDummyCheckout(subscriptionId),
  });
}
