import type { MetricsDto, RecentEscalatedDto } from "@innopeak/client-sdk";

import { dashboardApi } from "@/app/_libs/api-sdk/dashboard-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type {
  AttentionReview,
  DashboardStats,
  DateRange,
  RatingDistributionRow,
} from "@/types/domain";

const RANGE_DAYS: Record<DateRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

/**
 * Dashboard analytics, backed by `GET /v1/dashboard/*` through the generated SDK.
 *
 * Every endpoint is tenant-scoped from the access token, so nothing here passes a tenant id —
 * the backend's `forbidNonWhitelisted` validation rejects one outright.
 *
 * Errors deliberately propagate. An earlier version caught them and returned the mock fixtures,
 * which meant an API outage rendered invented review counts and invented reviewers as if they
 * were the tenant's own data, with no error shown anywhere.
 */
export class DashboardService {
  /**
   * `metrics` now carries the rating distribution too — `getStats`/`getRatingDistribution` used
   * to be two round trips for the same `days` window; callers that need both should share one
   * `getMetrics` call rather than each hitting the endpoint separately.
   */
  static async getMetrics(range: DateRange, locationId?: string): Promise<MetricsDto> {
    const response = await dashboardApi.dashboardControllerGetMetricsV1({
      days: RANGE_DAYS[range],
      locationId,
    });
    return unwrap<MetricsDto>(response.data);
  }

  static toStats(range: DateRange, metrics: MetricsDto): DashboardStats {
    return {
      range,
      reviewCount: metrics.total,
      // Null means the window held no reviews at all; the card renders 0.0 ★ for that.
      averageRating: Math.round((metrics.avgRating ?? 0) * 10) / 10,
      pendingApproval: metrics.pending,
      escalatedOpen: metrics.escalated,
    };
  }

  static toRatingDistribution(metrics: MetricsDto): RatingDistributionRow[] {
    const { ratingDistribution } = metrics;

    // `percentage` is relative to the largest bucket, not to the total — it drives the bar width,
    // so the tallest bar fills the track. Matches what the mock fixtures established.
    const max = Math.max(...[1, 2, 3, 4, 5].map((star) => ratingDistribution[star] ?? 0), 1);

    return ([5, 4, 3, 2, 1] as const).map((star) => {
      const count = ratingDistribution[star] ?? 0;
      return { star, count, percentage: Math.round((count / max) * 100) };
    });
  }

  static async getAttentionReviews(limit = 4, locationId?: string): Promise<AttentionReview[]> {
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
