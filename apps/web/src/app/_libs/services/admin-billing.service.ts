import { MOCK_ADMIN_BILLING } from "@/app/_libs/mock-data/admin-billing";
import type { BusinessBillingInfo } from "@/types/domain";

/**
 * Super Admin billing/usage summary. Mock implementation — becomes a real
 * backend call once billing is wired to a payments provider. Hooks/
 * components only ever call `useAdminBilling`, never this class directly.
 */
export class AdminBillingService {
  static async getBilling(): Promise<BusinessBillingInfo[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_ADMIN_BILLING;
  }
}
