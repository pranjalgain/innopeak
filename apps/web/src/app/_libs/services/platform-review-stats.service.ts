import { adminOverviewApi } from "@/app/_libs/api-sdk/admin-overview-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { PlatformReviewStats } from "@/types/domain";

/**
 * Platform-wide review throughput (total reviews fetched, total replies
 * sent) across every tenant, against the real
 * `GET /v1/admin/overview/review-stats` endpoint. Hooks/components only
 * ever call `useAdminOverview`, never this class directly.
 */
export class PlatformReviewStatsService {
  static async get(): Promise<PlatformReviewStats> {
    const response = await adminOverviewApi.adminOverviewControllerGetReviewStatsV1();
    return unwrap<PlatformReviewStats>(response.data);
  }
}
