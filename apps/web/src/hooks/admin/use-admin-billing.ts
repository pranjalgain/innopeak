import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";

import { AdminBillingService } from "@/app/_libs/services/admin-billing.service";
import { adminBillingSummaryQueryKey } from "@/hooks/admin/admin-query-keys";
import { toastApiError } from "@/hooks/common/toast-api-error";
import type { AtRiskSubscription, PostErasureCharge, UpgradeTrendPoint } from "@/types/domain";

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
  postErasureCharges: PostErasureCharge[];
  /** Marks one charged-after-deletion-request payment handled; resolves to whether it worked. */
  resolvePostErasureCharge: (receiptId: string) => Promise<boolean>;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** One query for the whole page, composed server-side (see `useAdminStatistics`). */
export function useAdminBilling(): UseAdminBillingResult {
  const t = useTranslations("adminBilling.toasts");

  const queryClient = useQueryClient();

  const summaryQuery = useQuery({
    queryKey: adminBillingSummaryQueryKey,
    queryFn: () => AdminBillingService.getSummary(TREND_MONTHS),
  });

  useEffect(() => {
    if (summaryQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryQuery.isError]);

  const resolveMutation = useMutation({
    mutationFn: (receiptId: string) => AdminBillingService.resolvePostErasureCharge(receiptId),
  });

  const resolvePostErasureCharge = useCallback(
    async (receiptId: string) => {
      try {
        await resolveMutation.mutateAsync(receiptId);
        toast.success(t("chargeHandled"));
        return true;
      } catch (error) {
        // A 404 means someone else already handled it — the refetch below drops it from the list.
        toastApiError(error, { 404: t("chargeAlreadyHandled") }, t("chargeHandleFailed"));
        return false;
      } finally {
        await queryClient.invalidateQueries({ queryKey: adminBillingSummaryQueryKey });
      }
    },
    [t, resolveMutation, queryClient],
  );

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
    postErasureCharges: summaryQuery.data?.postErasureCharges ?? [],
    resolvePostErasureCharge,
    isLoading: summaryQuery.isLoading,
    isError: summaryQuery.isError,
    refetch: () => void summaryQuery.refetch(),
  };
}
