import { adminOverviewApi } from "@/app/_libs/api-sdk/admin-overview-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AdminOverviewStats } from "@/types/domain";

export class AdminOverviewStatsService {
  static async get(): Promise<AdminOverviewStats> {
    const response = await adminOverviewApi.adminOverviewControllerGetStatsV1();
    return unwrap<AdminOverviewStats>(response.data);
  }
}
