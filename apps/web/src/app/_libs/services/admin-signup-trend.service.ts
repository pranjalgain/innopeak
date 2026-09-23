import { adminOverviewApi } from "@/app/_libs/api-sdk/admin-overview-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { SignupTrendPoint } from "@/types/domain";

/**
 * Tenant signups bucketed by calendar month over the trailing `months` months, oldest first —
 * against the real `GET /v1/admin/overview/signup-trend` endpoint. Every month in the window is
 * present, including zero-signup ones, so the chart never has to fill gaps itself. Hooks/components
 * only ever call `useAdminOverview`, never this class directly.
 */
export class AdminSignupTrendService {
  static async get(months: number): Promise<SignupTrendPoint[]> {
    const response = await adminOverviewApi.adminOverviewControllerGetSignupTrendV1({ months });
    return unwrap<SignupTrendPoint[]>(response.data);
  }
}
