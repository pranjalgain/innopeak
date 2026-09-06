import { MOCK_ADMIN_ACTIVITY } from "@/app/_libs/mock-data/admin-activity";
import type { PlatformActivityEntry } from "@/types/domain";

/**
 * Admin activity service. Mock implementation — becomes a real backend call
 * (an audit log of platform-admin actions) once that API exists. Hooks and
 * components only ever call `useAdminActivity`, never this class directly.
 */
export class AdminActivityService {
  static async getRecentActivity(): Promise<PlatformActivityEntry[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_ADMIN_ACTIVITY;
  }
}
