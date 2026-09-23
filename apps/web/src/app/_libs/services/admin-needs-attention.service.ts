import { adminOverviewApi } from "@/app/_libs/api-sdk/admin-overview-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AdminBusiness } from "@/types/domain";

/**
 * Non-connected businesses (disconnected, needs re-auth, or never onboarded), most urgent first,
 * capped at `limit` — against the real `GET /v1/admin/overview/needs-attention` endpoint.
 * Hooks/components only ever call `useAdminOverview`, never this class directly.
 */
export class AdminNeedsAttentionService {
  static async get(limit: number): Promise<AdminBusiness[]> {
    const response = await adminOverviewApi.adminOverviewControllerGetNeedsAttentionV1({ limit });
    return unwrap<AdminBusiness[]>(response.data);
  }
}
