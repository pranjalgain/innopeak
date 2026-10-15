import type { MetricsDto, RecentEscalatedDto } from "@innopeak/client-sdk";

import { dashboardApi } from "@/app/_libs/api-sdk/dashboard-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type {
  AttentionReview,
  DashboardMetrics,
  DashboardStats,
  DateRange,
  RatingDistributionRow,
} from "@/types/domain";

const RANGE_DAYS: Record<DateRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

/** Errors deliberately propagate (no mock-fixture fallback): an outage must not render invented counts as the tenant's data. */
export class DashboardService {
  /** One fetch derives both the stats and the rating distribution, so the raw SDK `MetricsDto` never leaves this class. */
  static async getMetrics(range: DateRange, locationId?: string): Promise<DashboardMetrics> {
    const response = await dashboardApi.dashboardControllerGetMetricsV1({
      days: RANGE_DAYS[range],
      locationId,
    });
    const metrics = unwrap<MetricsDto>(response.data);
    return {
      stats: this.toStats(range, metrics),
      ratingDistribution: this.toRatingDistribution(metrics),
    };
  }

  private static toStats(range: DateRange, metrics: MetricsDto): DashboardStats {
    return {
      range,
      reviewCount: metrics.total,
      // Null means the window held no reviews at all; the card renders 0.0 ★ for that.
      averageRating: Math.round((metrics.avgRating ?? 0) * 10) / 10,
      pendingApproval: metrics.pending,
      escalatedOpen: metrics.escalated,
    };
  }

  private static toRatingDistribution(metrics: MetricsDto): RatingDistributionRow[] {
    const { ratingDistribution } = metrics;

    // Relative to the largest bucket, not the total: it drives bar width, so the tallest bar fills the track.
    const max = Math.max(...[1, 2, 3, 4, 5].map((star) => ratingDistribution[star] ?? 0), 1);

    return ([5, 4, 3, 2, 1] as const).map((star) => {
      const count = ratingDistribution[star] ?? 0;
      return { star, count, percentage: Math.round((count / max) * 100) };
    });
  }

  static async getAttentionReviews(limit = 3, locationId?: string): Promise<AttentionReview[]> {
    const response = await dashboardApi.dashboardControllerGetRecentEscalatedV1({
      limit,
      locationId,
    });
    const reviews = unwrap<RecentEscalatedDto[]>(response.data);

    return reviews.map((review) => {
      // The API returns null for an anonymous or anonymized reviewer; the card expects a string.
      const reviewerName = review.reviewerName?.trim() || "Anonymous";

      return {
        id: review.id,
        reviewerName,
        initials: this.toInitials(reviewerName),
        rating: review.rating,
        snippet: review.reviewText ?? "",
        // Read from the API, never inferred from the rating: the two reasons are independent of
        // the star count, so a 5-star blocklist match is routine.
        escalationReason: review.escalationReason ?? null,
      };
    });
  }

  private static toInitials(name: string): string {
    return (
      name
        .split(/\s+/)
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase() || "AN"
    );
  }
}
