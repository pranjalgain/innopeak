/** Frontend paths the Dummy/Stripe redirect URLs point back at. Relative to `FRONTEND_URL`. */
export const BILLING_REDIRECT_PATHS = {
  // `{CHECKOUT_SESSION_ID}` is a literal Stripe Checkout template token that Stripe fills in on
  // redirect; the frontend passes it to `POST /v1/billing/checkout/reconcile`.
  CHECKOUT_SUCCESS: '/settings?tab=billing&checkout=success&session_id={CHECKOUT_SESSION_ID}',
  CHECKOUT_CANCEL: '/settings?tab=billing&checkout=cancel',
  PORTAL_RETURN: '/settings?tab=billing',
  /** Dummy-only confirmation page. */
  DUMMY_CHECKOUT: '/billing/dummy-checkout',
  /** Dummy-only confirmation page. */
  DUMMY_PORTAL: '/billing/dummy-portal',
} as const;

/** Stripe event types this app acts on; every other type maps to `'unhandled'` and is skipped. */
export const HANDLED_STRIPE_EVENT_TYPES = [
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.payment_succeeded',
] as const;

/** How long a webhook for an unknown Stripe customer is left to be retried by Stripe before it is
 *  acked and dropped. Genuine misses (replication lag, a still-committing checkout) resolve in
 *  seconds; older ones are customers this DB will never know, and failing them for days risks Stripe
 *  disabling the endpoint. */
export const UNKNOWN_CUSTOMER_RETRY_GRACE_MS = 60 * 60 * 1000;
