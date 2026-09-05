import { MOCK_ADMIN_USERS } from "@/app/_libs/mock-data/admin-users";
import type { AdminUser } from "@/types/domain";

/**
 * Super Admin cross-tenant user management. Mock implementation — becomes a
 * real backend call once a platform-admin API exists. Hooks/components only
 * ever call `useAdminUsers`, never this class directly.
 */
export class AdminUserService {
  static async getUsers(): Promise<AdminUser[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_ADMIN_USERS;
  }

  static async toggleActive(id: string): Promise<AdminUser> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const user = MOCK_ADMIN_USERS.find((u) => u.id === id);
    if (!user) throw new Error(`User ${id} not found`);
    user.isActive = !user.isActive;
    return user;
  }
}
