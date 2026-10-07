import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";

/** Called when the "update card" form mounts so `clientSecret` is ready before the tenant finishes typing. */
export function useCreateSetupIntent(): UseMutationResult<{ clientSecret: string }, unknown, void> {
  return useMutation({
    mutationFn: () => BillingService.createSetupIntent(),
  });
}
