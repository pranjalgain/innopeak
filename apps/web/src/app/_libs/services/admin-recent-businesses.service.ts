import { adminOverviewApi } from "@/app/_libs/api-sdk/admin-overview-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AdminBusiness } from "@/types/domain";

/**
 * The newest businesses, newest first, capped at `limit` — against the real
 * `GET /v1/admin/overview/recent-businesses` endpoint. Hooks/components only ever call
 * `useAdminOverview`, never this class directly.
 */
export class AdminRecentBusinessesService {
  static async get(limit: number): Promise<AdminBusiness[]> {
    const response = await adminOverviewApi.adminOverviewControllerGetRecentBusinessesV1({ limit });
    return unwrap<AdminBusiness[]>(response.data);
  }
}
