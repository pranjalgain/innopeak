import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { lt } from 'drizzle-orm';

/** Stripe's idempotency pattern, keyed on Stripe's event id; separate from TenantSubscriptionsRepository because ledger bookkeeping is its own concern. */
@Injectable()
export class StripeWebhookEventsRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Insert-first ON CONFLICT DO NOTHING: 0 rows means a duplicate delivery to skip. Always runs inside the handler's
   * transaction, so a failed handler rolls the ledger row back and Stripe's retry re-runs it.
   * `customerId` is null for 'unhandled' events; stored so the admin view can resolve the tenant without an FK.
   */
  async insertIfNew(
    id: string,
    type: string,
    customerId: string | null,
    tx?: DrizzleTransaction
  ): Promise<boolean> {
    const rows = await (tx ?? this.dbService.db)
      .insert(schema.stripeWebhookEvents)
      .values({ id, type, stripeCustomerId: customerId })
      .onConflictDoNothing()
      .returning({ id: schema.stripeWebhookEvents.id });

    return rows.length > 0;
  }

  /**
   * The ledger exists to skip a redelivered event, and Stripe redelivers for three days at most. Older rows carry only an event id, its type and a
   * customer id, and nothing reads them again except the admin events list, which shows recent ones.
   */
  async deleteProcessedBefore(cutoff: Date): Promise<number> {
    const rows = await this.dbService.db
      .delete(schema.stripeWebhookEvents)
      .where(lt(schema.stripeWebhookEvents.processedAt, cutoff.toISOString()))
      .returning({ id: schema.stripeWebhookEvents.id });

    return rows.length;
  }
}
