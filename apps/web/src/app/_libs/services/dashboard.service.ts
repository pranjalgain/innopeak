import {
  MOCK_ATTENTION_REVIEWS,
  MOCK_DASHBOARD_STATS,
  MOCK_RATING_DISTRIBUTION,
} from "@/app/_libs/mock-data/dashboard-stats";
import type { AttentionReview, DashboardStats, DateRange, RatingDistributionRow } from "@/types/domain";

/**
 * Dashboard service. Mock implementation — becomes real backend calls
 * (review stats, escalated-review queries) once that API exists. Hooks and
 * components only ever call `useDashboardStats`, never this class directly.
 */
export class DashboardService {
  static async getStats(range: DateRange): Promise<DashboardStats> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_DASHBOARD_STATS[range];
  }

  static async getRatingDistribution(): Promise<RatingDistributionRow[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_RATING_DISTRIBUTION;
  }

  static async getAttentionReviews(): Promise<AttentionReview[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_ATTENTION_REVIEWS;
  }
}
