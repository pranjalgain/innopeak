import { adminBillingApi } from "@/app/_libs/api-sdk/admin-billing-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AdminBillingSummary } from "@/types/domain";

/**
 * The Billing page's whole first screen, against the real `GET /v1/admin/billing/summary`
 * endpoint. Hooks/components only ever call `useAdminBilling`, never this class directly.
 */
export class AdminBillingService {
  static async getSummary(months: number): Promise<AdminBillingSummary> {
    const response = await adminBillingApi.adminBillingControllerGetSummaryV1({ months });
    return unwrap<AdminBillingSummary>(response.data);
  }

  /** `GET /v1/admin/billing/has-paid-tenants` — a cheap existence check, not the full summary.
   *  Backs the admin layout's Billing nav item and the Billing page's own route guard, which must
   *  both stay available whenever at least one tenant is on Paid, independent of the deploy-level
   *  `paymentFeatureEnabled` flag (that flag only ever gates *starting* a new checkout). */
  static async hasPaidTenants(): Promise<boolean> {
    const response = await adminBillingApi.adminBillingControllerHasPaidTenantsV1();
    return unwrap<{ hasPaidTenants: boolean }>(response.data).hasPaidTenants;
  }
}
