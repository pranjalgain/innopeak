import { useQuery } from "@tanstack/react-query";

import { DashboardService } from "@/app/_libs/services/dashboard.service";
import { useConnection } from "@/hooks/connections/use-connection";
import type {
  AttentionReview,
  DashboardStats,
  DateRange,
  RatingDistributionRow,
} from "@/types/domain";

const ATTENTION_REVIEWS_LIMIT = 4;

export const dashboardMetricsQueryKey = (range: DateRange, locationId: string | null) =>
  ["dashboard", "metrics", range, locationId] as const;
export const dashboardAttentionReviewsQueryKey = (limit: number, locationId: string | null) =>
  ["dashboard", "attention-reviews", limit, locationId] as const;

interface UseDashboardStatsResult {
  stats: DashboardStats | null;
  ratingDistribution: RatingDistributionRow[];
  attentionReviews: AttentionReview[];
  isLoading: boolean;
  error: string | null;
}

/**
 * One hook per screen keeps loading state simple. Two independent queries (metrics, attention reviews) because they key on
 * different things and a cached attention page shouldn't be discarded when the range changes.
 * No tenant lookup: endpoints scope from the access token, and gating on `AuthService.me()` would leave the screen
 * loading forever if it failed. The active location id (`useConnection()`'s `state.location.id`) is in both query keys so
 * switching business fetches fresh data instead of showing the previous business's numbers.
 */
export function useDashboardStats(range: DateRange): UseDashboardStatsResult {
  const { state, isLoading: isResolvingLocation } = useConnection();
  const locationId = state?.location?.id ?? null;

  // Both queries wait for `["connection"]` to settle: until then `locationId` is null, which the API reads as "every
  // location", so firing early paints summed numbers that then jump to the active store's.
  const isReady = !isResolvingLocation;

  const metricsQuery = useQuery({
    queryKey: dashboardMetricsQueryKey(range, locationId),
    queryFn: () => DashboardService.getMetrics(range, locationId ?? undefined),
    enabled: isReady,
  });

  const attentionQuery = useQuery({
    queryKey: dashboardAttentionReviewsQueryKey(ATTENTION_REVIEWS_LIMIT, locationId),
    queryFn: () =>
      DashboardService.getAttentionReviews(ATTENTION_REVIEWS_LIMIT, locationId ?? undefined),
    enabled: isReady,
  });

  const metrics = metricsQuery.data;

  return {
    stats: metrics?.stats ?? null,
    ratingDistribution: metrics?.ratingDistribution ?? [],
    attentionReviews: attentionQuery.data ?? [],
    // `!isReady` matters: a disabled query reports `isLoading: false` with no data, which would flash the empty state
    // before the active location resolves.
    isLoading: !isReady || metricsQuery.isLoading || attentionQuery.isLoading,
    error: metricsQuery.isError || attentionQuery.isError ? "Could not load dashboard data." : null,
  };
}
