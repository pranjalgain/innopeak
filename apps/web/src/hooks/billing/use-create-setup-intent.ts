import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";

/** `POST /v1/billing/setup-intent` — starts the Stripe Elements card-collection flow. Called when
 *  the "update card" form mounts, so its `clientSecret` is ready before the tenant finishes typing
 *  a card number. */
export function useCreateSetupIntent(): UseMutationResult<{ clientSecret: string }, unknown, void> {
  return useMutation({
    mutationFn: () => BillingService.createSetupIntent(),
  });
}
