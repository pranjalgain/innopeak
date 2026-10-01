import { adminUsersApi } from "@/app/_libs/api-sdk/admin-users-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AdminUser } from "@/types/domain";

export interface ListAdminUsersParams {
  search?: string;
}

/**
 * Super Admin cross-tenant user management, against the real
 * `POST /v1/admin/users*` endpoints. Hooks/components only ever call
 * `useAdminUsers`, never this class directly.
 */
export class AdminUserService {
  /** `search` is applied server-side — see `ListAdminUsersQueryDto`'s own comment. */
  static async getUsers(params: ListAdminUsersParams = {}): Promise<AdminUser[]> {
    const response = await adminUsersApi.adminUsersControllerListV1({ search: params.search });
    return unwrap<AdminUser[]>(response.data);
  }

  static async toggleActive(id: string): Promise<AdminUser> {
    const response = await adminUsersApi.adminUsersControllerToggleActiveV1({ userId: id });
    return unwrap<AdminUser>(response.data);
  }
}
