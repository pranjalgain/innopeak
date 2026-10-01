import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';

/**
 * `stripe_webhook_events` — Stripe's own recommended idempotency pattern, keyed on Stripe's own
 * event id rather than `uuidv7()` (see `0011_billing.sql`). Its own small repository/DB-service
 * pair, separate from `TenantSubscriptionsRepository`: idempotency bookkeeping is a distinct
 * concern from the subscription state itself, even though both are read/written in the same
 * webhook request.
 */
@Injectable()
export class StripeWebhookEventsRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Insert-first, `ON CONFLICT DO NOTHING` — 0 rows returned means this event id was already
   * processed (a duplicate delivery, Stripe's own retry behavior), and the caller must skip it.
   *
   * `tx` is optional but always passed by `BillingWebhooksService`, which runs this insert inside
   * the SAME transaction as the event's state-changing writes — so a failure partway through that
   * handler rolls this insert back too, and Stripe's retry (which sees no ledger row) actually
   * re-attempts the whole thing instead of silently no-op'ing forever against a ledger entry that
   * recorded "processed" before the work was actually done.
   *
   * `customerId` is `null` for a `'unhandled'` event (see `PaymentWebhookEvent`), which carries no
   * Stripe customer id at all — stored so the admin-facing webhook-activity view can resolve which
   * tenant (if any) this event was for, without this table needing its own FK to `tenants`.
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
}
