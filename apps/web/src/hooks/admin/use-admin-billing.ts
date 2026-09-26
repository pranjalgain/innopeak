import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";

import { AdminBillingService } from "@/app/_libs/services/admin-billing.service";
import { adminBillingSummaryQueryKey } from "@/hooks/admin/admin-query-keys";
import type { AtRiskSubscription, BillingWebhookEvent, UpgradeTrendPoint } from "@/types/domain";

/** How many months the upgrade-trend chart shows, counting back from the current one. */
const TREND_MONTHS = 6;

interface UseAdminBillingResult {
  freeCount: number;
  paidCount: number;
  activeCount: number;
  pastDueCount: number;
  canceledCount: number;
  incompleteCount: number;
  cancelingCount: number;
  upgradeTrend: UpgradeTrendPoint[];
  atRisk: AtRiskSubscription[];
  recentWebhookEvents: BillingWebhookEvent[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** One query, one endpoint (`GET /v1/admin/billing/summary`) — same reasoning as
 *  `useAdminStatistics`: every figure on the Billing page is composed server-side into a single
 *  payload, since none of these is ever fetched or refreshed independently of the others. */
export function useAdminBilling(): UseAdminBillingResult {
  const t = useTranslations("adminBilling.toasts");

  const summaryQuery = useQuery({
    queryKey: adminBillingSummaryQueryKey,
    queryFn: () => AdminBillingService.getSummary(TREND_MONTHS),
  });

  useEffect(() => {
    if (summaryQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryQuery.isError]);

  return {
    freeCount: summaryQuery.data?.freeCount ?? 0,
    paidCount: summaryQuery.data?.paidCount ?? 0,
    activeCount: summaryQuery.data?.activeCount ?? 0,
    pastDueCount: summaryQuery.data?.pastDueCount ?? 0,
    canceledCount: summaryQuery.data?.canceledCount ?? 0,
    incompleteCount: summaryQuery.data?.incompleteCount ?? 0,
    cancelingCount: summaryQuery.data?.cancelingCount ?? 0,
    upgradeTrend: summaryQuery.data?.upgradeTrend ?? [],
    atRisk: summaryQuery.data?.atRisk ?? [],
    recentWebhookEvents: summaryQuery.data?.recentWebhookEvents ?? [],
    isLoading: summaryQuery.isLoading,
    isError: summaryQuery.isError,
    refetch: () => void summaryQuery.refetch(),
  };
}
