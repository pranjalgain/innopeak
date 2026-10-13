import { adminBusinessesApi } from "@/app/_libs/api-sdk/admin-businesses-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AdminBusiness, PaginationMeta } from "@/types/domain";

export interface ListAdminBusinessesParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminBusinessPage {
  businesses: AdminBusiness[];
  meta: PaginationMeta;
}

// The SDK types `erasureRequestedAt` as `object | null` (generator quirk with nullable `@ApiPropertyOptional` strings), so declare the real shape.
type ApiAdminBusiness = Omit<AdminBusiness, "erasureRequestedAt"> & {
  erasureRequestedAt: string | null;
};

export class AdminBusinessService {
  /** `search` and paging are applied server-side; `meta.total` counts the same filter. */
  static async getBusinesses(params: ListAdminBusinessesParams = {}): Promise<AdminBusinessPage> {
    const response = await adminBusinessesApi.adminBusinessesControllerListV1({
      search: params.search,
      page: params.page,
      pageSize: params.pageSize,
    });
    return unwrap<{ businesses: ApiAdminBusiness[]; meta: PaginationMeta }>(response.data);
  }

  static async setStatus(id: string, status: AdminBusiness["status"]): Promise<AdminBusiness> {
    const response = await adminBusinessesApi.adminBusinessesControllerUpdateStatusV1({
      tenantId: id,
      updateBusinessStatusDto: { status },
    });
    return unwrap<ApiAdminBusiness>(response.data);
  }

  /** Suspends immediately and starts the grace period; a nightly job anonymizes later (`ERASURE_GRACE_PERIOD_DAYS`). 404 if no such tenant or already erased. */
  static async requestErasure(id: string): Promise<AdminBusiness> {
    const response = await adminBusinessesApi.adminBusinessesControllerRequestErasureV1({
      tenantId: id,
    });
    return unwrap<ApiAdminBusiness>(response.data);
  }

  /** Restores the business to active. 409 `BUSINESS_ERASURE_NOT_PENDING` if no erasure is pending, 404 if there is no such business. */
  static async cancelErasure(id: string): Promise<AdminBusiness> {
    const response = await adminBusinessesApi.adminBusinessesControllerCancelErasureV1({
      tenantId: id,
    });
    return unwrap<ApiAdminBusiness>(response.data);
  }
}
