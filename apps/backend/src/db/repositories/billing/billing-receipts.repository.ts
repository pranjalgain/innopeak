import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import type {
  BillingReceiptRow,
  InsertBillingReceiptInput,
  RecordReceiptOutcome,
} from './types/billing.type';

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

/** One row per paid Stripe invoice; BillingWebhooksService is the only writer. */
@Injectable()
export class BillingReceiptsRepository {
  constructor(private readonly dbService: DBService) {}

  /** Insert-first ON CONFLICT DO NOTHING on `stripe_invoice_id`, so a duplicate webhook can't create a second receipt. `tx` lets the webhook commit it with the subscription update and event ledger. */
  async insertIfNew(
    input: InsertBillingReceiptInput,
    tx?: DrizzleTransaction
  ): Promise<RecordReceiptOutcome> {
    // Flagged by the INSERT itself so no gap exists between "paid" and "flagged" in which an erasure could be requested
    // or cancelled. Covers a still-pending erasure or the latest cancelled one (a retried webhook can arrive after the
    // owner restored the business). A $0 invoice owes nothing back.
    const paidAfterErasureRequest = sql<boolean>`(${input.amountPaid} > 0 AND EXISTS (
      SELECT 1 FROM tenants
      WHERE id = ${input.tenantId}::uuid
        AND (
          (status = 'suspended'
            AND erasure_requested_at IS NOT NULL
            AND erasure_requested_at <= ${input.paidAt}::timestamptz)
          OR (last_erasure_requested_at IS NOT NULL
            AND last_erasure_requested_at <= ${input.paidAt}::timestamptz
            AND ${input.paidAt}::timestamptz <= last_erasure_cancelled_at)
        )
    ))`;

    const rows = await (tx ?? this.dbService.db)
      .insert(schema.billingReceipts)
      .values({ ...input, paidAfterErasureRequest })
      .onConflictDoNothing({ target: schema.billingReceipts.stripeInvoiceId })
      .returning({ flagged: schema.billingReceipts.paidAfterErasureRequest });

    const row = rows[0];
    return { inserted: row !== undefined, paidAfterErasureRequest: row?.flagged ?? false };
  }

  async findByTenantId(tenantId: string): Promise<BillingReceiptRow[]> {
    const rows = await this.dbService.db
      .select(RECEIPT_COLUMNS)
      .from(schema.billingReceipts)
      .where(eq(schema.billingReceipts.tenantId, tenantId))
      .orderBy(desc(schema.billingReceipts.paidAt));

    return rows;
  }

  /** Tenant-scoped in the query itself, so a call site that forgets to compare `tenantId` can't reintroduce an IDOR. */
  async findByIdForTenant(id: string, tenantId: string): Promise<BillingReceiptRow | null> {
    const rows = await this.dbService.db
      .select(RECEIPT_COLUMNS)
      .from(schema.billingReceipts)
      .where(and(eq(schema.billingReceipts.id, id), eq(schema.billingReceipts.tenantId, tenantId)))
      .limit(1);

    return (rows[0] as BillingReceiptRow | undefined) ?? null;
  }
}
