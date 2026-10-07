import type { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import type { SubscriptionCancellationSource } from '@common/enums/subscription-cancellation-source.enum';
import type { SubscriptionStatus } from '@common/enums/subscription-status.enum';

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

/** Whether this delivery created the row (a replay of the same invoice does not), and whether payment landed after an erasure was requested. */
export interface RecordReceiptOutcome {
  inserted: boolean;
  paidAfterErasureRequest: boolean;
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
  cancellationSource: SubscriptionCancellationSource | null;
  /** Last confirmed in sync with Stripe (webhook, checkout-redirect reconcile or sweep); `null` means never. */
  stripeLastVerifiedAt: string | null;
  /** Bounds the reconciliation sweep; `null` means no checkout was ever started. */
  checkoutStartedAt: string | null;
}

export interface InsertSubscriptionInput {
  tenantId: string;
  planId: string;
}

/** Every field optional: callers patch one webhook event's worth of fields, never the whole row. */
export type TenantSubscriptionPatch = Partial<Omit<TenantSubscriptionRow, 'id' | 'tenantId'>>;

export interface SyncSubscriptionFieldsInput {
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface SetToPaidInput extends SyncSubscriptionFieldsInput {
  stripeSubscriptionId: string;
}
