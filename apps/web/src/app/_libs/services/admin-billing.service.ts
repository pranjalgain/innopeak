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

export class AdminBillingService {
  static async getSummary(months: number): Promise<AdminBillingSummary> {
    const response = await adminBillingApi.adminBillingControllerGetSummaryV1({ months });
    return unwrap<AdminBillingSummary>(response.data);
  }

  /** Removes the charge from the queue once the admin has refunded it in Stripe (or decided not to). 404 if unknown or already handled. */
  static async resolvePostErasureCharge(receiptId: string): Promise<void> {
    await adminBillingApi.adminBillingControllerResolvePostErasureChargeV1({ receiptId });
  }

  static async listWebhookEvents(
    params: ListBillingWebhookEventsParams,
  ): Promise<BillingWebhookEventList> {
    const response = await adminBillingApi.adminBillingControllerListWebhookEventsV1({
      page: params.page,
      pageSize: params.pageSize,
      // Same string-literal set as `StripeWebhookEventTypeKey` but a distinct nominal type; safe to cast.
      type: params.type as AdminBillingControllerListWebhookEventsV1TypeEnum,
    });
    return unwrap<BillingWebhookEventList>(response.data);
  }

  /** Cheap existence check backing the admin Billing nav item and route guard; works whenever any tenant is Paid, regardless of `paymentFeatureEnabled` (which only gates new checkouts). */
  static async hasPaidTenants(): Promise<boolean> {
    const response = await adminBillingApi.adminBillingControllerHasPaidTenantsV1();
    return unwrap<{ hasPaidTenants: boolean }>(response.data).hasPaidTenants;
  }
}
