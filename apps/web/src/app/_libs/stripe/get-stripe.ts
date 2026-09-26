import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { env } from "env";

let stripePromise: Promise<Stripe | null> | null = null;

/** Loaded once, lazily — every "update card" dialog open reuses the same script/instance rather
 *  than re-fetching Stripe.js each time it's opened. Returns a promise resolving to `null` (not a
 *  throw) when `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` isn't set — expected whenever the backend is
 *  running PAYMENT_PROVIDER=dummy, since in-app card entry is Stripe-only. Callers should check
 *  `isStripeConfigured()` up front to show a friendly message instead of a half-working form. */
export function getStripe(): Promise<Stripe | null> {
  const key = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    return Promise.resolve(null);
  }
  stripePromise ??= loadStripe(key);
  return stripePromise;
}

/** A plain env check, not a hook — `NEXT_PUBLIC_*` vars are inlined at build time, so this never
 *  changes at runtime and needs no state. */
export function isStripeConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}
