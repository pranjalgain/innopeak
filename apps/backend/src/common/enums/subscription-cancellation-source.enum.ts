/**
 * Who set `cancel_at_period_end`: only a cancellation made by erasure may be resumed when the
 * erasure is cancelled; resuming an owner's deliberate cancellation would charge them against their
 * wishes. `null` = not cancelled, or cancelled by something that records no source (e.g. the Stripe
 * Customer Portal) — treated as the owner's.
 */
export enum SubscriptionCancellationSource {
  OWNER = 'owner',
  ERASURE = 'erasure',
}
