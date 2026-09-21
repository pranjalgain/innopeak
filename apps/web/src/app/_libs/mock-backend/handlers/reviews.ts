import { requireTenantUser } from "../auth-context";
import { failure, success } from "../response";
import { defineRoutes } from "../router";
import { getDb, type MockReview } from "../state";

function toListItem(review: MockReview) {
  const latestResponse = review.responses[review.responses.length - 1] ?? null;
  return {
    id: review.id,
    locationId: review.locationId,
    reviewerName: review.reviewerName,
    rating: review.rating,
    reviewText: review.reviewText,
    reviewedAt: review.reviewedAt,
    sentiment: review.sentiment,
    classification: review.classification,
    escalationReason: review.escalationReason,
    matchedKeywords: review.matchedKeywords,
    status: review.status,
    anonymizedAt: review.anonymizedAt,
    removedUpstreamAt: review.removedUpstreamAt,
    responseCount: review.responses.length,
    latestResponse,
  };
}

export const reviewsRoutes = defineRoutes([
  {
    method: "GET",
    pattern: "/v1/reviews",
    handler: (ctx) => {
      const auth = requireTenantUser(ctx.auth);
      const page = Number(ctx.query.get("page") ?? "1") || 1;
      const pageSize = Number(ctx.query.get("pageSize") ?? "20") || 20;
      const status = ctx.query.get("status");
      const classification = ctx.query.get("classification");
      const search = ctx.query.get("search")?.toLowerCase();

      let matches = getDb().reviews.filter((review) => review.tenantId === auth.tenantId);
      if (status) matches = matches.filter((review) => review.status === status);
      if (classification)
        matches = matches.filter((review) => review.classification === classification);
      if (search) {
        matches = matches.filter(
          (review) =>
            review.reviewText?.toLowerCase().includes(search) ||
            review.reviewerName?.toLowerCase().includes(search),
        );
      }
      matches = [...matches].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));

      const total = matches.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const start = (page - 1) * pageSize;
      const pageItems = matches.slice(start, start + pageSize).map(toListItem);

      return success({ data: pageItems, meta: { page, pageSize, total, totalPages } });
    },
  },
  {
    method: "GET",
    pattern: "/v1/reviews/:reviewId",
    handler: (ctx) => {
      const auth = requireTenantUser(ctx.auth);
      const review = getDb().reviews.find(
        (r) => r.id === ctx.params.reviewId && r.tenantId === auth.tenantId,
      );
      if (!review) return failure(404, "Review not found.");

      return success({
        ...toListItem(review),
        externalReviewId: review.externalReviewId,
        externalUpdatedAt: review.externalUpdatedAt,
        responses: review.responses,
      });
    },
  },
]);
