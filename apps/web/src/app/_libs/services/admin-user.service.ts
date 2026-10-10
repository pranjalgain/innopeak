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

  static async toggleActive(id: string): Promise<AdminUser> {
    const response = await adminUsersApi.adminUsersControllerToggleActiveV1({ userId: id });
    return unwrap<AdminUser>(response.data);
  }
}
