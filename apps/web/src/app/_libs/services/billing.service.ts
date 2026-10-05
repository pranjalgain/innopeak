import { billingApi } from "@/app/_libs/api-sdk/billing-api";
import { unwrap } from "@/app/_libs/services/api-error";
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

/** Reads the server-chosen filename (`InnoPeak-Receipt-<invoice-number-or-date>.pdf`, see
 *  `buildReceiptFilename` on the backend) out of `Content-Disposition` rather than hardcoding one
 *  here — this call goes through Next.js's own same-origin rewrite (see `apiConfig`'s doc
 *  comment), so the header is always readable, no CORS `exposedHeaders` needed. */
function filenameFromContentDisposition(contentDisposition: unknown): string {
  const match = typeof contentDisposition === "string" && /filename="([^"]+)"/.exec(contentDisposition);
  return match ? match[1] : DEFAULT_RECEIPT_FILENAME;
}

/**
 * Tenant-facing billing — plans/subscription reads, Checkout/Customer-Portal session creation,
 * and the §3a "choose active location" write. Thin wrappers over the generated `billingApi`,
 * mirroring `PlatformSettingsService`'s style exactly (`unwrap<T>()` on every response). Hooks/
 * components only ever call `use*` hooks in `@/hooks/billing/`, never this class directly.
 */
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

  static async createPortalSession(): Promise<RedirectUrlResult> {
    const response = await billingApi.billingControllerCreatePortalSessionV1();
    return unwrap<RedirectUrlResult>(response.data);
  }

  /**
   * `POST /v1/billing/checkout/reconcile` — called once the browser lands back on the success
   * page with the `session_id` Stripe appended to `success_url` (see `useCheckoutReconciliation`).
   * Reads the Checkout Session straight from Stripe and applies it if
   * `checkout.session.completed` hasn't landed yet, so the subscription reads as Paid even when
   * that webhook was delayed or missed entirely.
   */
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

  /**
   * `POST /v1/billing/dummy/complete-checkout` — dev/test only (404s unless
   * `PAYMENT_PROVIDER=dummy`). Called from the Dummy checkout confirmation page with the
   * `subscriptionId` query param `DummyPaymentProvider.createCheckoutSession` minted, applying the
   * same state transition a real Stripe `checkout.session.completed` webhook would.
   */
  static async completeDummyCheckout(subscriptionId: string): Promise<void> {
    await billingApi.billingControllerCompleteDummyCheckoutV1({
      completeDummyCheckoutDto: { subscriptionId },
    });
  }

  /**
   * `POST /v1/billing/cancel` — in-app cancellation, works the same for every payment provider.
   * The subscription stays Paid with full entitlements until the current period ends.
   */
  static async cancelSubscription(): Promise<void> {
    await billingApi.billingControllerCancelSubscriptionV1();
  }

  /** `GET /v1/billing/receipts` — Stripe-only payment history, most recent first. Always empty on
   *  PAYMENT_PROVIDER=dummy, since there's no real charge behind it to document. */
  static async listReceipts(): Promise<Receipt[]> {
    const response = await billingApi.billingControllerListReceiptsV1();
    return unwrap<ReceiptListResult>(response.data).receipts;
  }

  /**
   * `GET /v1/billing/receipts/:id/pdf` — a binary PDF body, not the `ApiResponse<T>` envelope
   * every other billing call returns (see the backend controller's own doc comment), so this
   * skips `unwrap` and reads `response.data` directly as a `Blob`. The generated SDK method types
   * this call `AxiosPromise<void>` since the Swagger response has no JSON schema; `responseType:
   * "blob"` is what actually makes axios hand back a `Blob` at runtime, which the SDK's own return
   * type can't express, hence the cast. The filename comes from the response's own
   * `Content-Disposition`, not a name built here — see `filenameFromContentDisposition`.
   */
  static async downloadReceiptPdf(receiptId: string): Promise<ReceiptPdfResult> {
    const response = await billingApi.billingControllerDownloadReceiptPdfV1(
      { receiptId },
      { responseType: "blob" },
    );
    return {
      blob: response.data as unknown as Blob,
      filename: filenameFromContentDisposition(response.headers["content-disposition"]),
    };
  }

  /** `GET /v1/billing/profile` — Stripe-only; 403s as `STRIPE_ONLY_FEATURE` on Dummy (see
   *  `Subscription.paymentProvider`, which callers should check before calling this at all). */
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

  /** `POST /v1/billing/setup-intent` — starts the Stripe Elements card-collection flow. The
   *  returned `clientSecret` is safe to hand to `stripe.confirmCardSetup` in the browser; the raw
   *  card itself never reaches this app's own backend. */
  static async createSetupIntent(): Promise<{ clientSecret: string }> {
    const response = await billingApi.billingControllerCreateSetupIntentV1();
    return unwrap<{ clientSecret: string }>(response.data);
  }

  /** Call once Stripe.js confirms the SetupIntent, passing the payment method id it returned —
   *  this is what actually makes the new card "the" card `getSubscription().paymentMethod` shows. */
  static async setDefaultPaymentMethod(paymentMethodId: string): Promise<void> {
    await billingApi.billingControllerSetDefaultPaymentMethodV1({
      setDefaultPaymentMethodDto: { paymentMethodId },
    });
  }
}

export type { BillingPlan, BillingPlanCode, BillingProfile, Receipt, Subscription };
