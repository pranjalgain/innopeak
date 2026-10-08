import type {
  BillingProfile,
  CheckoutSessionSnapshot,
  CreateCheckoutSessionInput,
  CreateCustomerInput,
  CreatePortalSessionInput,
  NewCheckoutPreparation,
  PaymentMethodSummary,
  PaymentProviderType,
  PaymentWebhookEvent,
  SubscriptionSnapshot,
  UpdateBillingProfileInput,
} from '../types/billing.type';

/** `constructWebhookEvent` returns a normalized `PaymentWebhookEvent` so `BillingWebhooksService` never touches provider-specific shapes. */
export abstract class PaymentProvider {
  abstract readonly type: PaymentProviderType;

  abstract createCustomer(input: CreateCustomerInput): Promise<{ customerId: string }>;

  abstract createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{ url: string }>;

  abstract createPortalSession(input: CreatePortalSessionInput): Promise<{ url: string }>;

  abstract cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void>;

  /** Undoes an at-period-end cancellation; only meaningful for a subscription that has not ended. */
  abstract resumeSubscription(subscriptionId: string): Promise<void>;

  /** Voids open invoices so a cancelled subscription stops being collected (erasure of a `past_due` one). Returns how many. */
  abstract voidOpenInvoices(subscriptionId: string): Promise<number>;

  /**
   * Ends any subscription immediately and removes the owner's name and email from the provider
   * (which keeps legally required invoices). A customer the provider no longer has must resolve, not throw.
   */
  abstract deleteCustomer(customerId: string): Promise<void>;

  /** `null` when there is no customer or no card on file. Never the PAN. */
  abstract getPaymentMethodSummary(customerId: string): Promise<PaymentMethodSummary | null>;

  /** Stripe-only; see `DummyPaymentProvider`. */
  abstract getBillingProfile(customerId: string): Promise<BillingProfile>;

  abstract updateBillingProfile(
    customerId: string,
    input: UpdateBillingProfileInput
  ): Promise<BillingProfile>;

  /** The raw card never reaches this backend (PCI SAQ A); only the `clientSecret` goes to the browser. */
  abstract createSetupIntent(customerId: string): Promise<{ clientSecret: string }>;

  /** A SetupIntent alone doesn't set the customer's default card, unlike Checkout. */
  abstract setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void>;

  /**
   * `payload` must be the exact raw body bytes (`req.rawBody`), not a re-serialized object: the
   * signature only matches the bytes Stripe signed. Throws `StripeWebhookSignatureInvalidException` on a bad signature.
   */
  abstract constructWebhookEvent(payload: Buffer, signature: string): PaymentWebhookEvent;

  /** Independent of whether the `checkout.session.completed` webhook has arrived, so a missed one doesn't leave a paid tenant reading as unpaid. */
  abstract retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionSnapshot>;

  /**
   * Called before every Checkout for an existing customer. Reports a live subscription the local row may not have recorded
   * yet, and otherwise expires the customer's still-open Checkouts: an older one left open (another tab, or the page Back
   * returns to) could be paid too and start a second subscription.
   */
  abstract prepareNewCheckout(customerId: string): Promise<NewCheckoutPreparation>;

  /** For tenants whose local row has no (or a stale) `stripe_subscription_id`. `null` means no active subscription, not an error. */
  abstract retrieveActiveSubscriptionForCustomer(
    customerId: string
  ): Promise<SubscriptionSnapshot | null>;
}
