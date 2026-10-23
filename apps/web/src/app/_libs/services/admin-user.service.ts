import { adminUsersApi } from "@/app/_libs/api-sdk/admin-users-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AdminUser, PaginationMeta } from "@/types/domain";

export interface ListAdminUsersParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminUserPage {
  users: AdminUser[];
  meta: PaginationMeta;
}

export class AdminUserService {
  /** `search` and paging are applied server-side; `meta.total` counts the same filter. */
  static async getUsers(params: ListAdminUsersParams = {}): Promise<AdminUserPage> {
    const response = await adminUsersApi.adminUsersControllerListV1({
      search: params.search,
      page: params.page,
      pageSize: params.pageSize,
    });
    return unwrap<{ users: AdminUser[]; meta: PaginationMeta }>(response.data);
  }

  /**
   * `active` is the state to end up in, not a flip: a stale list or a double click then cannot re-enable someone who was just
   * deactivated (the server leaves a user already there as it is).
   */
  static async toggleActive(id: string, active: boolean): Promise<AdminUser> {
    const response = await adminUsersApi.adminUsersControllerToggleActiveV1({ userId: id, active });
    return unwrap<AdminUser>(response.data);
  }
}
