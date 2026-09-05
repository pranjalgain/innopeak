import { MOCK_PLATFORM_REVIEW_STATS } from "@/app/_libs/mock-data/platform-review-stats";
import type { PlatformReviewStats } from "@/types/domain";

/**
 * Platform-wide review throughput (total reviews fetched, total replies
 * sent) across every tenant. Mock implementation — becomes a real
 * aggregate query once a platform-admin API exists. Hooks/components only
 * ever call `useAdminOverview`, never this class directly.
 */
export class PlatformReviewStatsService {
  static async get(): Promise<PlatformReviewStats> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_PLATFORM_REVIEW_STATS;
  }
}
