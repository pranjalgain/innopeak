/** Turns a raw Stripe event type (e.g. `"invoice_payment.paid"`) into a readable phrase
 *  (`"Invoice payment paid"`) — Stripe's own event catalog has hundreds of types, far more than
 *  this app could keep a curated, translated label for (see `HANDLED_STRIPE_WEBHOOK_EVENT_TYPES`
 *  for the handful this app does), so anything outside that curated set falls back to this
 *  mechanical split-and-capitalize instead of showing Stripe's dotted/underscored wire format
 *  verbatim. */
export function humanizeStripeEventType(type: string): string {
  const words = type.split(/[._]/).filter(Boolean);
  if (words.length === 0) return type;
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
