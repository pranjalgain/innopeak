import { adminOverviewApi } from "@/app/_libs/api-sdk/admin-overview-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { SignupTrendPoint } from "@/types/domain";

/** Every month in the window is present, including zero-signup ones, so the chart never fills gaps. */
export class AdminSignupTrendService {
  static async get(months: number): Promise<SignupTrendPoint[]> {
    const response = await adminOverviewApi.adminOverviewControllerGetSignupTrendV1({ months });
    return unwrap<SignupTrendPoint[]>(response.data);
  }
}
