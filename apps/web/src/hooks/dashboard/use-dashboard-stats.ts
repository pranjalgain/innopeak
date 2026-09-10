import { useEffect, useState } from "react";

import { DashboardService } from "@/app/_libs/services/dashboard.service";
import type {
  AttentionReview,
  DashboardStats,
  DateRange,
  RatingDistributionRow,
} from "@/types/domain";

interface UseDashboardStatsResult {
  stats: DashboardStats | null;
  ratingDistribution: RatingDistributionRow[];
  attentionReviews: AttentionReview[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Loads everything the Dashboard screen needs for a given date range. One
 * hook per screen (rather than one per service method) keeps the loading
 * state simple — the screen shows its skeleton/empty state once, not per
 * card.
 *
 * No tenant lookup here: the endpoints scope themselves from the access token. An earlier version
 * fetched `AuthService.me()` first and gated the load on the result, which left the screen loading
 * forever whenever that call failed.
 */
export function useDashboardStats(range: DateRange): UseDashboardStatsResult {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [ratingDistribution, setRatingDistribution] = useState<RatingDistributionRow[]>([]);
  const [attentionReviews, setAttentionReviews] = useState<AttentionReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    Promise.all([
      DashboardService.getStats(range),
      DashboardService.getRatingDistribution(range),
      DashboardService.getAttentionReviews(),
    ])
      .then(([statsResult, ratingResult, attentionResult]) => {
        if (cancelled) return;
        setStats(statsResult);
        setRatingDistribution(ratingResult);
        setAttentionReviews(attentionResult);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load dashboard data.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range]);

  return { stats, ratingDistribution, attentionReviews, isLoading, error };
}
