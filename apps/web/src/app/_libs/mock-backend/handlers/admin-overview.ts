import { requireAdmin } from "../auth-context";
import { success } from "../response";
import { defineRoutes } from "../router";
import { getDb } from "../state";

export const adminOverviewRoutes = defineRoutes([
  {
    method: "GET",
    pattern: "/v1/admin/overview/activity",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      const entries = [...getDb().activity].sort((a, b) =>
        b.occurredAt.localeCompare(a.occurredAt),
      );
      return success(entries);
    },
  },
  {
    method: "GET",
    pattern: "/v1/admin/overview/review-stats",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      const reviews = getDb().reviews;
      const repliesSent = reviews.reduce(
        (count, review) =>
          count + review.responses.filter((response) => response.status === "approved").length,
        0,
      );
      return success({ totalReviewsFetched: reviews.length, totalRepliesSent: repliesSent });
    },
  },
]);
