/**
 * Module-local constants only — not user-facing messages (those live in
 * `src/common/constants/messages.constants.ts`, see module-structure.md).
 */

/** Frontend paths the Dummy/Stripe redirect URLs point back at. Relative to `FRONTEND_URL`. Real
 *  pages are frontend follow-up work (out of scope here) — see `DummyPaymentProvider`'s own doc
 *  comment for what each is expected to do once built. */
export const BILLING_REDIRECT_PATHS = {
  // `{CHECKOUT_SESSION_ID}` is a literal Stripe Checkout template token — Stripe substitutes it
  // with the real session id on redirect, no app-side session-id capture needed. The frontend reads
  // `session_id` alongside `checkout=success` and calls `POST /v1/billing/checkout/reconcile` —
  // see `BillingReconciliationService`.
  CHECKOUT_SUCCESS: '/settings?tab=billing&checkout=success&session_id={CHECKOUT_SESSION_ID}',
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

/** How long a webhook for a Stripe customer this app has no record of keeps being retried (by
 *  letting Stripe re-deliver it) before it is acknowledged and dropped. A miss that is genuinely
 *  transient — replication lag, a race with a still-committing checkout — resolves within seconds;
 *  anything older is a customer this database will never know (a shared Stripe account, a wiped
 *  local DB), and failing it for days would only risk Stripe disabling the whole endpoint. */
export const UNKNOWN_CUSTOMER_RETRY_GRACE_MS = 60 * 60 * 1000;
