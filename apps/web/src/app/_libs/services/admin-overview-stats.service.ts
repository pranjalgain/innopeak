import { adminOverviewApi } from "@/app/_libs/api-sdk/admin-overview-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AdminOverviewStats } from "@/types/domain";

/**
 * The Overview page's four stat cards (businesses, users, reviews fetched, replies sent), against
 * the real `GET /v1/admin/overview/stats` endpoint. Hooks/components only ever call
 * `useAdminOverview`, never this class directly.
 */
export class AdminOverviewStatsService {
  static async get(): Promise<AdminOverviewStats> {
    const response = await adminOverviewApi.adminOverviewControllerGetStatsV1();
    return unwrap<AdminOverviewStats>(response.data);
  }
}
