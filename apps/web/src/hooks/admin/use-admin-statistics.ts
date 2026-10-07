import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { toast } from "sonner";

import { AdminStatisticsService } from "@/app/_libs/services/admin-statistics.service";
import { adminStatisticsSummaryQueryKey } from "@/hooks/admin/admin-query-keys";
import type {
  ClassificationBreakdownPoint,
  ConnectionHealth,
  RatingDistributionPoint,
  ReviewsTrendPoint,
} from "@/types/domain";

/** How many months the reviews-volume trend chart shows, counting back from the current one. */
const TREND_MONTHS = 6;

interface UseAdminStatisticsResult {
  replyRatePercent: number;
  avgRating: number;
  syncSuccessRatePercent: number;
  connectionHealth: ConnectionHealth;
  reviewsTrend: ReviewsTrendPoint[];
  ratingDistribution: RatingDistributionPoint[];
  classificationBreakdown: ClassificationBreakdownPoint[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

const EMPTY_CONNECTION_HEALTH: ConnectionHealth = {
  connected: 0,
  needsReauth: 0,
  disconnected: 0,
  neverConnected: 0,
};

/** One query for the whole page, composed server-side, unlike Overview's independent per-panel queries. */
export function useAdminStatistics(): UseAdminStatisticsResult {
  const t = useTranslations("adminStatistics.toasts");

  const summaryQuery = useQuery({
    queryKey: adminStatisticsSummaryQueryKey,
    queryFn: () => AdminStatisticsService.getSummary(TREND_MONTHS),
  });

  useEffect(() => {
    if (summaryQuery.isError) toast.error(t("loadFailed"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryQuery.isError]);

  return {
    replyRatePercent: summaryQuery.data?.replyRatePercent ?? 0,
    avgRating: summaryQuery.data?.avgRating ?? 0,
    syncSuccessRatePercent: summaryQuery.data?.syncSuccessRatePercent ?? 0,
    connectionHealth: summaryQuery.data?.connectionHealth ?? EMPTY_CONNECTION_HEALTH,
    reviewsTrend: summaryQuery.data?.reviewsTrend ?? [],
    ratingDistribution: summaryQuery.data?.ratingDistribution ?? [],
    classificationBreakdown: summaryQuery.data?.classificationBreakdown ?? [],
    isLoading: summaryQuery.isLoading,
    isError: summaryQuery.isError,
    refetch: () => void summaryQuery.refetch(),
  };
}
