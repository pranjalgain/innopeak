import { PaymentProviderUnavailableException } from './payment-provider-unavailable.exception';

/**
 * Stripe SDK error types that mean "Stripe, or the path to it, is having a problem" rather than "this request was wrong":
 * the connection failed or timed out, Stripe answered 5xx, we were rate limited, or our own key was rejected (a deploy fault the
 * caller can do nothing about). Matched on `type` so this module does not import the SDK.
 */
const TRANSIENT_STRIPE_ERROR_TYPES = new Set([
  'StripeConnectionError',
  'StripeAPIError',
  'StripeRateLimitError',
  'StripeAuthenticationError',
]);

function isTransientStripeError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const type = (error as { type?: unknown }).type;
  return typeof type === 'string' && TRANSIENT_STRIPE_ERROR_TYPES.has(type);
}

/**
 * Turns a raw provider failure into the HTTP error the caller should see. A transient Stripe error becomes
 * `503 PAYMENT_PROVIDER_UNAVAILABLE` instead of an anonymous 500; anything else is returned unchanged.
 * One seam for every current and future Stripe call, rather than a try/catch in each.
 */
export function mapProviderFailure(error: unknown): unknown {
  return isTransientStripeError(error) ? new PaymentProviderUnavailableException() : error;
}
