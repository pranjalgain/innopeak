import { adminStatisticsApi } from "@/app/_libs/api-sdk/admin-statistics-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AdminStatisticsSummary } from "@/types/domain";

export class AdminStatisticsService {
  static async getSummary(months: number): Promise<AdminStatisticsSummary> {
    const response = await adminStatisticsApi.adminStatisticsControllerGetSummaryV1({ months });
    return unwrap<AdminStatisticsSummary>(response.data);
  }
}
