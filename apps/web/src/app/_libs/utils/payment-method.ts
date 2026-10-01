/** Stripe reports `expMonth` unpadded (`1`..`12`) — pads to the conventional 2-digit card-expiry
 *  display (`"01"`), shared by every masked-card summary rendered from a `PaymentMethodSummary`. */
export function formatCardExpiryMonth(expMonth: number): string {
  return `${expMonth}`.padStart(2, "0");
}
