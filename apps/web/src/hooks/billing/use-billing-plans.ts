import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";
import type { BillingPlan } from "@/types/domain";

export const billingPlansQueryKey = ["billing", "plans"] as const;

interface BillingPlansResult {
  plans: BillingPlan[];
  currentPlanId: string;
}

/** `GET /v1/billing/plans` — both plans (Free/Paid) plus the caller tenant's current plan id.
 *  Owner-only on the backend; only mount this from an owner-gated screen. */
export function useBillingPlans(): UseQueryResult<BillingPlansResult> {
  return useQuery({
    queryKey: billingPlansQueryKey,
    queryFn: () => BillingService.getPlans(),
  });
}
