import { useMutation, type UseMutationResult, useQueryClient } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";
import { billingProfileQueryKey } from "@/hooks/billing/use-billing-profile";
import type { BillingProfile } from "@/types/domain";

export function useUpdateBillingProfile(): UseMutationResult<BillingProfile, unknown, BillingProfile> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: BillingProfile) => BillingService.updateBillingProfile(input),
    onSuccess: (profile) => {
      queryClient.setQueryData(billingProfileQueryKey, profile);
    },
  });
}
