import { adminUsersApi } from "@/app/_libs/api-sdk/admin-users-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AdminUser } from "@/types/domain";

/**
 * Super Admin cross-tenant user management, against the real
 * `POST /v1/admin/users*` endpoints. Hooks/components only ever call
 * `useAdminUsers`, never this class directly.
 */
export class AdminUserService {
  static async getUsers(): Promise<AdminUser[]> {
    const response = await adminUsersApi.adminUsersControllerListV1();
    return unwrap<AdminUser[]>(response.data);
  }

  static async toggleActive(id: string): Promise<AdminUser> {
    const response = await adminUsersApi.adminUsersControllerToggleActiveV1({ userId: id });
    return unwrap<AdminUser>(response.data);
  }
}
