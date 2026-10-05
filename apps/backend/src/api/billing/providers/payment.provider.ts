import type {
  BillingProfile,
  CheckoutSessionSnapshot,
  CreateCheckoutSessionInput,
  CreateCustomerInput,
  CreatePortalSessionInput,
  PaymentMethodSummary,
  PaymentProviderType,
  PaymentWebhookEvent,
  SubscriptionSnapshot,
  UpdateBillingProfileInput,
} from '../types/billing.type';

/**
 * Swappable payment backend — same abstract-provider shape as `StorageProvider`
 * (`src/api/media/providers/storage.provider.ts`): one abstract base, two concrete
 * implementations (`DummyPaymentProvider`/`StripePaymentProvider`), selected via `PAYMENT_PROVIDER`
 * and factory-provided in `billing.module.ts`.
 *
 * `constructWebhookEvent` returns the normalized `PaymentWebhookEvent` union (see that type's own
 * doc comment) rather than a raw Stripe/provider-specific event — `BillingWebhooksService` never
 * imports the `stripe` package or branches on a provider-specific shape.
 */
export abstract class PaymentProvider {
  abstract readonly type: PaymentProviderType;

  abstract createCustomer(input: CreateCustomerInput): Promise<{ customerId: string }>;

  abstract createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{ url: string }>;

  abstract createPortalSession(input: CreatePortalSessionInput): Promise<{ url: string }>;

  abstract cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void>;

  /** The customer's default card, for read-only display in Settings > Billing — `null` when there
   *  is no customer yet or no card on file. Never the PAN, only what's safe to show unmasked. */
  abstract getPaymentMethodSummary(customerId: string): Promise<PaymentMethodSummary | null>;

  /** In-app "manage billing" — read/write the two Stripe `Customer` fields this app lets a tenant
   *  edit directly, replacing what used to be a redirect to the hosted Customer Portal. Stripe-only:
   *  see `BillingService`'s own guard and `DummyPaymentProvider`'s doc comment for why. */
  abstract getBillingProfile(customerId: string): Promise<BillingProfile>;

  abstract updateBillingProfile(
    customerId: string,
    input: UpdateBillingProfileInput
  ): Promise<BillingProfile>;

  /** Starts the client-side card-collection flow (Stripe Elements + `stripe.confirmCardSetup`) —
   *  the `clientSecret` is the only thing safe to hand to the browser; the raw card never reaches
   *  this backend, keeping it out of PCI scope (SAQ A). */
  abstract createSetupIntent(customerId: string): Promise<{ clientSecret: string }>;

  /** Called once the browser has confirmed the SetupIntent, to make the newly-added card "the"
   *  card `getPaymentMethodSummary`/future charges use — mirrors what Checkout does automatically
   *  for the first card, since a SetupIntent alone doesn't set a customer's default. */
  abstract setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void>;

  /**
   * `payload` is the exact raw request body bytes (`req.rawBody` — see `bootstrap.ts`'s
   * route-scoped `bodyParser.raw()` ahead of the global `bodyParser.json()`), never a
   * re-serialized/parsed object: a real signature check is only meaningful against the exact bytes
   * Stripe signed. Throws `StripeWebhookSignatureInvalidException` on a bad signature.
   */
  abstract constructWebhookEvent(payload: Buffer, signature: string): PaymentWebhookEvent;

  /**
   * Reads a Checkout Session directly from the provider, independent of whether its
   * `checkout.session.completed` webhook has arrived yet — `BillingReconciliationService`'s
   * synchronous checkout-redirect path, for the case a missed/delayed webhook would otherwise
   * leave the tenant reading as unpaid despite Stripe having already completed the charge.
   */
  abstract retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionSnapshot>;

  /**
   * The newest active subscription for a customer, directly from the provider — the periodic
   * reconciliation sweep's own "ask Stripe what's actually true" primitive for a tenant whose
   * local row has no (or a stale) `stripe_subscription_id` to look up by id instead. `null` means
   * genuinely no active subscription (an abandoned checkout, a canceled one) — not an error.
   */
  abstract retrieveActiveSubscriptionForCustomer(
    customerId: string
  ): Promise<SubscriptionSnapshot | null>;
}
