import type { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import type { SubscriptionStatus } from '@common/enums/subscription-status.enum';

// ─── BillingPlansRepository ──────────────────────────────────────────────────

export interface BillingPlanRow {
  id: string;
  code: BillingPlanCode;
  stripeProductId: string | null;
  stripePriceId: string | null;
  /** `null` = unlimited. */
  maxLocations: number | null;
  /** `null` = unlimited. */
  maxAiDraftsPerMonth: number | null;
  /** `null` = unlimited. */
  maxTeamMembers: number | null;
  customPromptsEnabled: boolean;
}

// ─── BillingReceiptsRepository ───────────────────────────────────────────────

export interface BillingReceiptRow {
  id: string;
  tenantId: string;
  stripeInvoiceId: string;
  stripeSubscriptionId: string | null;
  amountPaid: number;
  currency: string;
  invoiceNumber: string | null;
  paidAt: string;
}

export interface InsertBillingReceiptInput {
  tenantId: string;
  stripeInvoiceId: string;
  stripeSubscriptionId: string | null;
  amountPaid: number;
  currency: string;
  invoiceNumber: string | null;
  paidAt: string;
}

// ─── TenantSubscriptionsRepository ───────────────────────────────────────────

export interface TenantSubscriptionRow {
  id: string;
  tenantId: string;
  planId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Last time this row was confirmed in sync with Stripe — by a webhook, the synchronous
   *  checkout-redirect reconciliation, or the periodic reconciliation sweep. `null` means never
   *  verified. A sweep confirming a tenant is still genuinely free stamps this too. */
  stripeLastVerifiedAt: string | null;
  /** When this tenant last started a Checkout Session — bounds the reconciliation sweep, see
   *  `0011_billing.sql`. `null` means no checkout was ever started. */
  checkoutStartedAt: string | null;
}

export interface InsertSubscriptionInput {
  tenantId: string;
  planId: string;
}

/** Every field optional — callers (`TenantSubscriptionsDbService`) build a patch shaped for one
 *  webhook event at a time, never the whole row. */
export type TenantSubscriptionPatch = Partial<Omit<TenantSubscriptionRow, 'id' | 'tenantId'>>;

// ─── TenantSubscriptionsDbService ────────────────────────────────────────────

export interface SyncSubscriptionFieldsInput {
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface SetToPaidInput extends SyncSubscriptionFieldsInput {
  stripeSubscriptionId: string;
}
