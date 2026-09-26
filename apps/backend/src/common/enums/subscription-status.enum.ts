/**
 * `tenant_subscriptions.status` — deliberately a subset of Stripe's own subscription statuses
 * (`trialing`/`incomplete_expired`/`unpaid` are omitted). See `0011_billing.sql`'s own comment:
 * nothing in this codebase produces those yet (no trial period in v1) — add a member only once a
 * real code path needs it. `null` (not a member here) means a pure-Free tenant with no Stripe
 * object at all — see the column's own comment.
 */
export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  INCOMPLETE = 'incomplete',
}
