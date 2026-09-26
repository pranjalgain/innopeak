import { adminStatisticsApi } from "@/app/_libs/api-sdk/admin-statistics-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AdminStatisticsSummary } from "@/types/domain";

/**
 * The Statistics page's whole first screen, against the real `GET /v1/admin/statistics/summary`
 * endpoint. Hooks/components only ever call `useAdminStatistics`, never this class directly.
 */
export class AdminStatisticsService {
  static async getSummary(months: number): Promise<AdminStatisticsSummary> {
    const response = await adminStatisticsApi.adminStatisticsControllerGetSummaryV1({ months });
    return unwrap<AdminStatisticsSummary>(response.data);
  }
}
