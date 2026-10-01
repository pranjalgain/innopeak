import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import type { BillingReceiptRow, InsertBillingReceiptInput } from './types/billing.type';

const RECEIPT_COLUMNS = {
  id: schema.billingReceipts.id,
  tenantId: schema.billingReceipts.tenantId,
  stripeInvoiceId: schema.billingReceipts.stripeInvoiceId,
  stripeSubscriptionId: schema.billingReceipts.stripeSubscriptionId,
  amountPaid: schema.billingReceipts.amountPaid,
  currency: schema.billingReceipts.currency,
  invoiceNumber: schema.billingReceipts.invoiceNumber,
  paidAt: schema.billingReceipts.paidAt,
} as const;

/**
 * `billing_receipts` — mechanical Drizzle queries only, see `0012_billing_receipts.sql`. One row
 * per successfully paid Stripe invoice; `BillingWebhooksService` is the only writer.
 */
@Injectable()
export class BillingReceiptsRepository {
  constructor(private readonly dbService: DBService) {}

  /** Insert-first, `ON CONFLICT DO NOTHING` — same idempotency shape as
   *  `StripeWebhookEventsRepository.insertIfNew`, keyed on `stripe_invoice_id` here since a
   *  duplicate webhook delivery for an already-recorded invoice must not create a second receipt.
   *  `tx` is optional so `BillingWebhooksService` can commit this atomically alongside the
   *  subscription-status update and the event-ledger insert in the same webhook delivery. */
  async insertIfNew(input: InsertBillingReceiptInput, tx?: DrizzleTransaction): Promise<void> {
    await (tx ?? this.dbService.db)
      .insert(schema.billingReceipts)
      .values(input)
      .onConflictDoNothing({ target: schema.billingReceipts.stripeInvoiceId });
  }

  async findByTenantId(tenantId: string): Promise<BillingReceiptRow[]> {
    const rows = await this.dbService.db
      .select(RECEIPT_COLUMNS)
      .from(schema.billingReceipts)
      .where(eq(schema.billingReceipts.tenantId, tenantId))
      .orderBy(desc(schema.billingReceipts.paidAt));

    return rows;
  }

  /**
   * Tenant-scoped by design, same reasoning as `ConnectionsRepository.findLocationByIdForTenant`:
   * the query itself excludes another tenant's receipt rather than relying on the caller to fetch
   * first and compare `tenantId` afterward, so a future call site can't reintroduce that IDOR by
   * forgetting the check.
   */
  async findByIdForTenant(id: string, tenantId: string): Promise<BillingReceiptRow | null> {
    const rows = await this.dbService.db
      .select(RECEIPT_COLUMNS)
      .from(schema.billingReceipts)
      .where(and(eq(schema.billingReceipts.id, id), eq(schema.billingReceipts.tenantId, tenantId)))
      .limit(1);

    return (rows[0] as BillingReceiptRow | undefined) ?? null;
  }
}
