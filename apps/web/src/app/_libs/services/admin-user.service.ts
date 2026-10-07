import { adminUsersApi } from "@/app/_libs/api-sdk/admin-users-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AdminUser } from "@/types/domain";

export interface ListAdminUsersParams {
  search?: string;
}

export class AdminUserService {
  /** `search` is applied server-side. */
  static async getUsers(params: ListAdminUsersParams = {}): Promise<AdminUser[]> {
    const response = await adminUsersApi.adminUsersControllerListV1({ search: params.search });
    return unwrap<AdminUser[]>(response.data);
  }

  static async toggleActive(id: string): Promise<AdminUser> {
    const response = await adminUsersApi.adminUsersControllerToggleActiveV1({ userId: id });
    return unwrap<AdminUser>(response.data);
  }
}
