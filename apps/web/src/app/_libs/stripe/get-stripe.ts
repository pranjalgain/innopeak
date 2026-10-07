import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { env } from "env";

let stripePromise: Promise<Stripe | null> | null = null;

/** Loaded once, lazily. Resolves to `null` (no throw) without `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, expected under
 *  PAYMENT_PROVIDER=dummy since in-app card entry is Stripe-only; callers check `isStripeConfigured()` first. */
export function getStripe(): Promise<Stripe | null> {
  const key = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    return Promise.resolve(null);
  }
  stripePromise ??= loadStripe(key);
  return stripePromise;
}

/** `NEXT_PUBLIC_*` vars are inlined at build time, so this never changes at runtime and needs no state. */
export function isStripeConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}
