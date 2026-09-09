import { ApiClient } from "@/app/_libs/services/api-client";
import type {
  AttentionReview,
  DashboardStats,
  DateRange,
  EscalationReason,
  RatingDistributionRow,
} from "@/types/domain";

const RANGE_DAYS: Record<DateRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

interface BackendMetrics {
  total: number;
  avgRating: number | null;
  pending: number;
  escalated: number;
}

interface BackendDistribution {
  distribution: Record<number, number>;
}

interface BackendEscalatedReview {
  id: string;
  reviewerName: string | null;
  rating: number;
  reviewText: string | null;
  escalationReason: EscalationReason | null;
  reviewedAt: string | null;
}

/**
 * Dashboard analytics, backed by `GET /v1/dashboard/*`.
 *
 * Every endpoint is tenant-scoped from the access token, so nothing here passes a tenant id —
 * sending one would be rejected by the backend's `forbidNonWhitelisted` validation anyway.
 *
 * Errors deliberately propagate. An earlier version caught them and returned the mock fixtures,
 * which meant an API outage rendered invented review counts and invented reviewers as if they
 * were the tenant's own data, with no error shown anywhere.
 */
export class DashboardService {
  static async getStats(range: DateRange): Promise<DashboardStats> {
    const data = await ApiClient.request<BackendMetrics>(
      `/v1/dashboard/metrics?days=${RANGE_DAYS[range]}`,
    );

    return {
      range,
      reviewCount: data.total,
      // Null means the window held no reviews at all; the card renders 0.0 ★ for that.
      averageRating: Math.round((data.avgRating ?? 0) * 10) / 10,
      pendingApproval: data.pending,
      escalatedOpen: data.escalated,
    };
  }

  static async getRatingDistribution(range: DateRange): Promise<RatingDistributionRow[]> {
    const data = await ApiClient.request<BackendDistribution>(
      `/v1/dashboard/rating-distribution?days=${RANGE_DAYS[range]}`,
    );
    const distribution = data.distribution ?? {};

    // `percentage` is relative to the largest bucket, not to the total — it drives the bar width,
    // so the tallest bar fills the track. Matches what the mock fixtures established.
    const max = Math.max(...[1, 2, 3, 4, 5].map((star) => distribution[star] ?? 0), 1);

    return ([5, 4, 3, 2, 1] as const).map((star) => {
      const count = distribution[star] ?? 0;
      return { star, count, percentage: Math.round((count / max) * 100) };
    });
  }

  static async getAttentionReviews(limit = 4): Promise<AttentionReview[]> {
    const reviews = await ApiClient.request<BackendEscalatedReview[]>(
      `/v1/dashboard/recent-escalated?limit=${limit}`,
    );

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
        escalationReason: review.escalationReason,
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
