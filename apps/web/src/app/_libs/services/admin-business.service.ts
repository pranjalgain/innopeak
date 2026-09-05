import { MOCK_ADMIN_BUSINESSES } from "@/app/_libs/mock-data/admin-businesses";
import type { AdminBusiness } from "@/types/domain";

/**
 * Super Admin business management ("business" is this area's user-facing
 * term for a tenant). Mock implementation — becomes a real backend call
 * once a platform-admin API exists. Hooks/components only ever call
 * `useAdminBusinesses`, never this class directly.
 */
export class AdminBusinessService {
  static async getBusinesses(): Promise<AdminBusiness[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_ADMIN_BUSINESSES;
  }

  static async setStatus(id: string, status: AdminBusiness["status"]): Promise<AdminBusiness> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const business = MOCK_ADMIN_BUSINESSES.find((b) => b.id === id);
    if (!business) throw new Error(`Business ${id} not found`);
    business.status = status;
    return business;
  }
}
