/** Turns a raw Stripe event type (`"invoice_payment.paid"`) into "Invoice payment paid" for types outside the curated `HANDLED_STRIPE_WEBHOOK_EVENT_TYPES` set. */
export function humanizeStripeEventType(type: string): string {
  const words = type.split(/[._]/).filter(Boolean);
  if (words.length === 0) return type;
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
