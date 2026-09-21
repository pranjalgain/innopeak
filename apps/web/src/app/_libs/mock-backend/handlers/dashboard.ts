import { requireTenantUser } from "../auth-context";
import { success } from "../response";
import { defineRoutes } from "../router";
import { getDb, type MockReview } from "../state";

function withinDays(review: MockReview, days: number): boolean {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(review.reviewedAt).getTime() >= cutoff;
}

export const dashboardRoutes = defineRoutes([
  {
    method: "GET",
    pattern: "/v1/dashboard/metrics",
    handler: (ctx) => {
      const auth = requireTenantUser(ctx.auth);
      const days = Number(ctx.query.get("days") ?? "30") || 30;
      const allTenantReviews = getDb().reviews.filter(
        (review) => review.tenantId === auth.tenantId,
      );
      const windowed = allTenantReviews.filter((review) => withinDays(review, days));

      const ratingDistribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
      for (const review of windowed) {
        ratingDistribution[String(review.rating)] =
          (ratingDistribution[String(review.rating)] ?? 0) + 1;
      }

      const avgRating =
        windowed.length === 0
          ? null
          : windowed.reduce((sum, review) => sum + review.rating, 0) / windowed.length;

      const pending = allTenantReviews.filter(
        (review) => review.status === "new" || review.status === "in_review",
      ).length;
      const escalated = allTenantReviews.filter(
        (review) =>
          review.classification === "escalated" &&
          (review.status === "new" || review.status === "in_review"),
      ).length;

      return success({ total: windowed.length, avgRating, pending, escalated, ratingDistribution });
    },
  },
  {
    method: "GET",
    pattern: "/v1/dashboard/recent-escalated",
    handler: (ctx) => {
      const auth = requireTenantUser(ctx.auth);
      const limit = Number(ctx.query.get("limit") ?? "4") || 4;
      const escalated = getDb()
        .reviews.filter(
          (review) => review.tenantId === auth.tenantId && review.classification === "escalated",
        )
        .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
        .slice(0, limit)
        .map((review) => ({
          id: review.id,
          reviewerName: review.reviewerName,
          rating: review.rating,
          reviewText: review.reviewText,
          escalationReason: review.escalationReason,
          reviewedAt: review.reviewedAt,
        }));
      return success(escalated);
    },
  },
]);
