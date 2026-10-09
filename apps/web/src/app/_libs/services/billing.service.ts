import { billingApi } from "@/app/_libs/api-sdk/billing-api";
import { unwrap } from "@/app/_libs/services/api-error";
import { filenameFromContentDisposition } from "@/app/_libs/utils/browser-download";
import type { BillingPlan, BillingPlanCode, BillingProfile, Receipt, Subscription } from "@/types/domain";

interface BillingPlansResult {
  plans: BillingPlan[];
  currentPlanId: string;
}

interface ReceiptListResult {
  receipts: Receipt[];
}

interface RedirectUrlResult {
  url: string;
}

interface ReceiptPdfResult {
  blob: Blob;
  filename: string;
}

const DEFAULT_RECEIPT_FILENAME = "InnoPeak-Receipt.pdf";

export class BillingService {
  static async getPlans(): Promise<BillingPlansResult> {
    const response = await billingApi.billingControllerListPlansV1();
    return unwrap<BillingPlansResult>(response.data);
  }

  static async getSubscription(): Promise<Subscription> {
    const response = await billingApi.billingControllerGetSubscriptionV1();
    return unwrap<Subscription>(response.data);
  }

  static async createCheckoutSession(): Promise<RedirectUrlResult> {
    const response = await billingApi.billingControllerCreateCheckoutSessionV1();
    return unwrap<RedirectUrlResult>(response.data);
  }

  /** Applies the Checkout Session read straight from Stripe if `checkout.session.completed` has not landed, so the subscription reads Paid even when that webhook was delayed or missed. */
  static async reconcileCheckoutSession(checkoutSessionId: string): Promise<Subscription> {
    const response = await billingApi.billingControllerReconcileCheckoutSessionV1({
      reconcileCheckoutSessionDto: { checkoutSessionId },
    });
    return unwrap<Subscription>(response.data);
  }

  static async setActiveLocation(locationId: string): Promise<void> {
    await billingApi.billingControllerSetActiveLocationV1({
      setActiveLocationDto: { locationId },
    });
  }

  /** The subscription stays Paid with full entitlements until the current period ends. */
  static async cancelSubscription(): Promise<void> {
    await billingApi.billingControllerCancelSubscriptionV1();
  }

  /** Empty until the tenant has made a real payment. */
  static async listReceipts(): Promise<Receipt[]> {
    const response = await billingApi.billingControllerListReceiptsV1();
    return unwrap<ReceiptListResult>(response.data).receipts;
  }

  /**
   * Binary PDF body, not the `ApiResponse<T>` envelope, so this skips `unwrap`. The SDK types it `AxiosPromise<void>`;
   * `responseType: "blob"` makes axios return a `Blob`, hence the cast. The filename comes from `Content-Disposition`
   * (see `filenameFromContentDisposition`).
   */
  static async downloadReceiptPdf(receiptId: string): Promise<ReceiptPdfResult> {
    const response = await billingApi.billingControllerDownloadReceiptPdfV1(
      { receiptId },
      { responseType: "blob" },
    );
    return {
      blob: response.data as unknown as Blob,
      filename: filenameFromContentDisposition(
        response.headers["content-disposition"],
        DEFAULT_RECEIPT_FILENAME,
      ),
    };
  }

  /** Updates the Stripe customer's name and email. */
  static async getBillingProfile(): Promise<BillingProfile> {
    const response = await billingApi.billingControllerGetBillingProfileV1();
    return unwrap<BillingProfile>(response.data);
  }

  static async updateBillingProfile(input: BillingProfile): Promise<BillingProfile> {
    const response = await billingApi.billingControllerUpdateBillingProfileV1({
      updateBillingProfileDto: { name: input.name ?? "", email: input.email ?? "" },
    });
    return unwrap<BillingProfile>(response.data);
  }

  /** The `clientSecret` is safe to give `stripe.confirmCardSetup`; the raw card never reaches our backend. */
  static async createSetupIntent(): Promise<{ clientSecret: string }> {
    const response = await billingApi.billingControllerCreateSetupIntentV1();
    return unwrap<{ clientSecret: string }>(response.data);
  }

  /** Call once Stripe.js confirms the SetupIntent; makes the new card the one `getSubscription().paymentMethod` shows. */
  static async setDefaultPaymentMethod(paymentMethodId: string): Promise<void> {
    await billingApi.billingControllerSetDefaultPaymentMethodV1({
      setDefaultPaymentMethodDto: { paymentMethodId },
    });
  }
}

export type { BillingPlan, BillingPlanCode, BillingProfile, Receipt, Subscription };
