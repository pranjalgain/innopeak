import type { AdminBillingControllerListWebhookEventsV1TypeEnum } from "@innopeak/client-sdk";

import { adminBillingApi } from "@/app/_libs/api-sdk/admin-billing-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type {
  AdminBillingSummary,
  BillingWebhookEventList,
  StripeWebhookEventTypeKey,
} from "@/types/domain";

export interface ListBillingWebhookEventsParams {
  page: number;
  pageSize: number;
  type?: StripeWebhookEventTypeKey;
}

/**
 * The Billing page's whole first screen, against the real `GET /v1/admin/billing/summary`
 * endpoint. Hooks/components only ever call `useAdminBilling`, never this class directly.
 */
export class AdminBillingService {
  static async getSummary(months: number): Promise<AdminBillingSummary> {
    const response = await adminBillingApi.adminBillingControllerGetSummaryV1({ months });
    return unwrap<AdminBillingSummary>(response.data);
  }

  /** `GET /v1/admin/billing/webhook-events` — paginated, filterable Stripe webhook activity,
   *  independent of the summary above. */
  static async listWebhookEvents(
    params: ListBillingWebhookEventsParams,
  ): Promise<BillingWebhookEventList> {
    const response = await adminBillingApi.adminBillingControllerListWebhookEventsV1({
      page: params.page,
      pageSize: params.pageSize,
      // The SDK's generated enum is structurally identical to `StripeWebhookEventTypeKey` (same
      // string literal set) but a distinct nominal type — safe to cast rather than re-declare it.
      type: params.type as AdminBillingControllerListWebhookEventsV1TypeEnum,
    });
    return unwrap<BillingWebhookEventList>(response.data);
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
