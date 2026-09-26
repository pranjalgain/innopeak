/**
 * Module-local constants only — not user-facing messages (those live in
 * `src/common/constants/messages.constants.ts`, see module-structure.md).
 */

/** Frontend paths the Dummy/Stripe redirect URLs point back at. Relative to `FRONTEND_URL`. Real
 *  pages are frontend follow-up work (out of scope here) — see `DummyPaymentProvider`'s own doc
 *  comment for what each is expected to do once built. */
export const BILLING_REDIRECT_PATHS = {
  CHECKOUT_SUCCESS: '/settings?tab=billing&checkout=success',
  CHECKOUT_CANCEL: '/settings?tab=billing&checkout=cancel',
  PORTAL_RETURN: '/settings?tab=billing',
  /** Dummy-only confirmation page — see `DummyPaymentProvider.createCheckoutSession`. */
  DUMMY_CHECKOUT: '/billing/dummy-checkout',
  /** Dummy-only confirmation page — see `DummyPaymentProvider.createPortalSession`. */
  DUMMY_PORTAL: '/billing/dummy-portal',
} as const;

/** Stripe event types this app acts on — every other incoming event type maps to `'unhandled'`
 *  in `StripePaymentProvider.constructWebhookEvent` and is logged/skipped by
 *  `BillingWebhooksService`, per the plan's v1 event table. */
export const HANDLED_STRIPE_EVENT_TYPES = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.payment_succeeded',
] as const;
