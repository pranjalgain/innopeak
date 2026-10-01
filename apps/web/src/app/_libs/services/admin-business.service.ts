import { adminBusinessesApi } from "@/app/_libs/api-sdk/admin-businesses-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AdminBusiness } from "@/types/domain";

export interface ListAdminBusinessesParams {
  search?: string;
}

/** The SDK types `erasureRequestedAt` as `object | null` (a generator quirk with every
 *  nullable-string `@ApiPropertyOptional` in this backend — see `tenant-member.service.ts`'s own
 *  `ApiTenantMember` for the same workaround), so the real shape is declared locally. */
type ApiAdminBusiness = Omit<AdminBusiness, "erasureRequestedAt"> & {
  erasureRequestedAt: string | null;
};

/**
 * Super Admin business management ("business" is this area's user-facing
 * term for a tenant), against the real `GET/POST /v1/admin/businesses*`
 * endpoints. Hooks/components only ever call `useAdminBusinesses`, never
 * this class directly.
 */
export class AdminBusinessService {
  /** `search` is applied server-side — see `ListAdminBusinessesQueryDto`'s own comment. */
  static async getBusinesses(params: ListAdminBusinessesParams = {}): Promise<AdminBusiness[]> {
    const response = await adminBusinessesApi.adminBusinessesControllerListV1({
      search: params.search,
    });
    return unwrap<ApiAdminBusiness[]>(response.data);
  }

  static async setStatus(id: string, status: AdminBusiness["status"]): Promise<AdminBusiness> {
    const response = await adminBusinessesApi.adminBusinessesControllerUpdateStatusV1({
      tenantId: id,
      updateBusinessStatusDto: { status },
    });
    return unwrap<ApiAdminBusiness>(response.data);
  }

  /**
   * Suspends the business immediately and starts its grace period; the actual anonymization of
   * every user in it runs later, in a nightly job — see the backend's `ERASURE_GRACE_PERIOD_DAYS`.
   * Platform-admin only. Throws `ApiError` on 404 (no such tenant, or already erased).
   */
  static async requestErasure(id: string): Promise<AdminBusiness> {
    const response = await adminBusinessesApi.adminBusinessesControllerRequestErasureV1({
      tenantId: id,
    });
    return unwrap<ApiAdminBusiness>(response.data);
  }

  /** Undoes `requestErasure` — restores the business to active. Throws `ApiError` on 404
   *  (no such tenant, or it has no erasure pending). */
  static async cancelErasure(id: string): Promise<AdminBusiness> {
    const response = await adminBusinessesApi.adminBusinessesControllerCancelErasureV1({
      tenantId: id,
    });
    return unwrap<ApiAdminBusiness>(response.data);
  }
}
