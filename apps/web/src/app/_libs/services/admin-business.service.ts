import { adminBusinessesApi } from "@/app/_libs/api-sdk/admin-businesses-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AdminBusiness } from "@/types/domain";

/**
 * Super Admin business management ("business" is this area's user-facing
 * term for a tenant), against the real `GET/POST /v1/admin/businesses*`
 * endpoints. Hooks/components only ever call `useAdminBusinesses`, never
 * this class directly.
 */
export class AdminBusinessService {
  static async getBusinesses(): Promise<AdminBusiness[]> {
    const response = await adminBusinessesApi.adminBusinessesControllerListV1();
    return unwrap<AdminBusiness[]>(response.data);
  }

  static async setStatus(id: string, status: AdminBusiness["status"]): Promise<AdminBusiness> {
    const response = await adminBusinessesApi.adminBusinessesControllerUpdateStatusV1({
      tenantId: id,
      updateBusinessStatusDto: { status },
    });
    return unwrap<AdminBusiness>(response.data);
  }
}
