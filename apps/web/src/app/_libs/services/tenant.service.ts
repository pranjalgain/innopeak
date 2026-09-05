import { MOCK_TENANT } from "@/app/_libs/mock-data/tenant";
import type { Tenant } from "@/types/domain";

/**
 * Tenant service. Mock implementation — `getCurrentTenant` becomes a real
 * `GET /v1/auth/me`-backed call once the auth module exists (see
 * apps/documentation/docs/backend/auth/api-reference.md). Hooks/components
 * never change when that happens, only this file does.
 */
export class TenantService {
  static async getCurrentTenant(): Promise<Tenant> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return MOCK_TENANT;
  }
}
