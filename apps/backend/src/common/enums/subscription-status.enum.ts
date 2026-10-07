/**
 * Deliberately a subset of Stripe's statuses (`trialing`/`incomplete_expired`/`unpaid` omitted):
 * nothing produces them yet, so add a member only once a code path needs it. `null` (not a member)
 * means a pure-Free tenant with no Stripe object.
 */
export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  INCOMPLETE = 'incomplete',
}
