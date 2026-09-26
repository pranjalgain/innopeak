import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { BillingService } from "@/app/_libs/services/billing.service";
import type { Receipt } from "@/types/domain";

export const receiptsQueryKey = ["billing", "receipts"] as const;

/** `GET /v1/billing/receipts` — Stripe-only payment history for Settings → Billing. Owner-only on
 *  the backend, same as every other billing read. */
export function useReceipts(): UseQueryResult<Receipt[]> {
  return useQuery({
    queryKey: receiptsQueryKey,
    queryFn: () => BillingService.listReceipts(),
  });
}
