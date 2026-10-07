import type { SubscriptionStatus } from '@common/enums/subscription-status.enum';

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

/** One calendar month's Free→Paid conversions (checkout.session.completed); only non-zero months are returned, like SignupTrendPoint. */
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

/** A payment taken after erasure was requested and not yet marked handled: the admin refund queue. */
export interface PostErasureChargeRow {
  receiptId: string;
  tenantId: string;
  businessName: string;
  invoiceNumber: string | null;
  /** Smallest currency unit (cents). */
  amountPaid: number;
  currency: string;
  paidAt: string;
}

export interface WebhookEventRow {
  id: string;
  type: string;
  processedAt: string;
  /** Resolved via `stripe_customer_id`; null for an orphan delivery. */
  tenantId: string | null;
  businessName: string | null;
}

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
  postErasureCharges: PostErasureChargeRow[];
}
