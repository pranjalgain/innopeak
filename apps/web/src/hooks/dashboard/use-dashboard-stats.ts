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
 * Loads everything the Dashboard screen needs for a given date range. One hook per screen
 * (rather than one per service method) keeps the loading state simple — the screen shows its
 * skeleton/empty state once, not per card. Two independent queries (metrics, attention reviews)
 * rather than one combined query: they key on different things (`range` vs a fixed limit) and a
 * cached "attention reviews" page shouldn't be thrown away just because the date range changed.
 *
 * No tenant lookup here: the endpoints scope themselves from the access token. An earlier version
 * fetched `AuthService.me()` first and gated the load on the result, which left the screen loading
 * forever whenever that call failed.
 *
 * Scoped to whichever business the Business Switcher currently has active (`useConnection()`'s
 * `state.location.id` — already the tenant's resolved selection, fallback included). That id is
 * folded into both query keys, not just passed to the service calls: switching the active
 * location changes the key, which is what makes react-query treat it as a different query and
 * fetch fresh data instead of quietly continuing to show the previous business's numbers under an
 * unchanged cache entry.
 */
export function useDashboardStats(range: DateRange): UseDashboardStatsResult {
  const { state, isLoading: isResolvingLocation } = useConnection();
  const locationId = state?.location?.id ?? null;

  // Both queries wait for `["connection"]` to settle. Until it does, `locationId` is null, and
  // null means "every location this tenant has" to the API — so firing early didn't just fetch
  // something stale, it fetched a genuinely different figure. A multi-location tenant opening the
  // dashboard saw the summed numbers across all their stores paint first, then jump to the active
  // store's a moment later when the key changed and a second request landed.
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
    stats: metrics ? DashboardService.toStats(range, metrics) : null,
    ratingDistribution: metrics ? DashboardService.toRatingDistribution(metrics) : [],
    attentionReviews: attentionQuery.data ?? [],
    // `!isReady` is part of this: a disabled query reports `isLoading: false` with no data, so
    // without it the screen would render its empty state for the instant before the active
    // location resolves, rather than staying on the skeleton it is already showing.
    isLoading: !isReady || metricsQuery.isLoading || attentionQuery.isLoading,
    error: metricsQuery.isError || attentionQuery.isError ? "Could not load dashboard data." : null,
  };
}
