import { adminOverviewApi } from "@/app/_libs/api-sdk/admin-overview-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AdminBusiness } from "@/types/domain";

export class AdminRecentBusinessesService {
  static async get(limit: number): Promise<AdminBusiness[]> {
    const response = await adminOverviewApi.adminOverviewControllerGetRecentBusinessesV1({ limit });
    return unwrap<AdminBusiness[]>(response.data);
  }
}
