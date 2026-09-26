/** `billing_plans.code` / `tenant_subscriptions` (via `plan_id`) — exactly two rows exist, seeded
 *  once by `0011_billing.sql`. See that migration's own header comment for why entitlements live
 *  directly on the plan row instead of a separate `plan_entitlements` table. */
export enum BillingPlanCode {
  FREE = 'free',
  PAID = 'paid',
}
