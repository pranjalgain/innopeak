import type { SubscriptionStatus } from '@common/enums/subscription-status.enum';

// ─── AdminBillingRepository ──────────────────────────────────────────────────

export interface PlanSplitCounts {
  freeCount: number;
  paidCount: number;
}

export interface SubscriptionStatusCounts {
  activeCount: number;
  pastDueCount: number;
  canceledCount: number;
  incompleteCount: number;
}

/** One calendar month's Free→Paid conversions — counted from `stripe_webhook_events` rows of type
 *  `checkout.session.completed` (the one event this app's webhook handler ever upgrades a tenant
 *  on), same "only non-zero months returned" contract as `SignupTrendPoint`. */
export interface UpgradeTrendPoint {
  year: number;
  /** 1-12. */
  month: number;
  count: number;
}

export interface AtRiskSubscriptionRow {
  tenantId: string;
  businessName: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
}

export interface WebhookEventRow {
  id: string;
  type: string;
  processedAt: string;
  /** Resolved via the event's `stripe_customer_id` against `tenant_subscriptions` — `null` for an
   *  orphan delivery (no tenant this app knows of has that Stripe customer id). */
  tenantId: string | null;
  businessName: string | null;
}

// ─── AdminBillingDbService ───────────────────────────────────────────────────

export interface AdminBillingSummary {
  freeCount: number;
  paidCount: number;
  activeCount: number;
  pastDueCount: number;
  canceledCount: number;
  incompleteCount: number;
  cancelingCount: number;
  upgradeTrend: UpgradeTrendPoint[];
  atRisk: AtRiskSubscriptionRow[];
}
