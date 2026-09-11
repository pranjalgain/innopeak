import { useQuery } from "@tanstack/react-query";

import { DashboardService } from "@/app/_libs/services/dashboard.service";
import type {
  AttentionReview,
  DashboardStats,
  DateRange,
  RatingDistributionRow,
} from "@/types/domain";

const ATTENTION_REVIEWS_LIMIT = 4;

export const dashboardMetricsQueryKey = (range: DateRange) => ["dashboard", "metrics", range] as const;
export const dashboardAttentionReviewsQueryKey = (limit: number) =>
  ["dashboard", "attention-reviews", limit] as const;

interface UseDashboardStatsResult {
  stats: DashboardStats | null;
  ratingDistribution: RatingDistributionRow[];
  attentionReviews: AttentionReview[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Loads everything the Dashboard screen needs for a given date range. One hook per screen
 * (rather than one per service method) keeps the loading state simple — the screen shows its
 * skeleton/empty state once, not per card. Two independent queries (metrics, attention reviews)
 * rather than one combined query: they key on different things (`range` vs a fixed limit) and a
 * cached "attention reviews" page shouldn't be thrown away just because the date range changed.
 *
 * No tenant lookup here: the endpoints scope themselves from the access token. An earlier version
 * fetched `AuthService.me()` first and gated the load on the result, which left the screen loading
 * forever whenever that call failed.
 */
export function useDashboardStats(range: DateRange): UseDashboardStatsResult {
  const metricsQuery = useQuery({
    queryKey: dashboardMetricsQueryKey(range),
    queryFn: () => DashboardService.getMetrics(range),
  });

  const attentionQuery = useQuery({
    queryKey: dashboardAttentionReviewsQueryKey(ATTENTION_REVIEWS_LIMIT),
    queryFn: () => DashboardService.getAttentionReviews(ATTENTION_REVIEWS_LIMIT),
  });

  const metrics = metricsQuery.data;

  return {
    stats: metrics ? DashboardService.toStats(range, metrics) : null,
    ratingDistribution: metrics ? DashboardService.toRatingDistribution(metrics) : [],
    attentionReviews: attentionQuery.data ?? [],
    isLoading: metricsQuery.isLoading || attentionQuery.isLoading,
    error: metricsQuery.isError || attentionQuery.isError ? "Could not load dashboard data." : null,
  };
}
