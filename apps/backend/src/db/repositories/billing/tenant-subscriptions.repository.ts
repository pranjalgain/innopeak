import { MESSAGES } from '@common/constants/messages.constants';
import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';

import type {
  InsertSubscriptionInput,
  TenantSubscriptionPatch,
  TenantSubscriptionRow,
} from './types/billing.type';

const SUBSCRIPTION_COLUMNS = {
  id: schema.tenantSubscriptions.id,
  tenantId: schema.tenantSubscriptions.tenantId,
  planId: schema.tenantSubscriptions.planId,
  stripeCustomerId: schema.tenantSubscriptions.stripeCustomerId,
  stripeSubscriptionId: schema.tenantSubscriptions.stripeSubscriptionId,
  status: schema.tenantSubscriptions.status,
  currentPeriodStart: schema.tenantSubscriptions.currentPeriodStart,
  currentPeriodEnd: schema.tenantSubscriptions.currentPeriodEnd,
  cancelAtPeriodEnd: schema.tenantSubscriptions.cancelAtPeriodEnd,
  stripeLastVerifiedAt: schema.tenantSubscriptions.stripeLastVerifiedAt,
  checkoutStartedAt: schema.tenantSubscriptions.checkoutStartedAt,
} as const;

/**
 * `tenant_subscriptions` — one row per tenant, always present (see `0011_billing.sql`'s own
 * comment: auto-created at signup on the `free` plan, so "which plan is this tenant on" never
 * needs a null-check anywhere else in the app). Mechanical Drizzle queries only; the webhook
 * state-machine business rules (which fields change for which Stripe event) live in
 * `BillingWebhooksService`, composed through `TenantSubscriptionsDbService`.
 */
@Injectable()
export class TenantSubscriptionsRepository {
  constructor(private readonly dbService: DBService) {}

  transaction<T>(fn: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
    return this.dbService.db.transaction(fn);
  }

  /**
   * Serializes `BillingService.createCheckoutSession` per tenant — same shape as
   * `ConnectionsRepository.acquireLocationConfirmLock`. Without it, two concurrent checkout
   * attempts for a tenant with no Stripe customer yet can both read `stripeCustomerId === null`
   * and each mint a *different* Stripe customer/Checkout Session before either write lands;
   * `attachStripeCustomerIdIfAbsent`'s `WHERE ... IS NULL` guard stops the DB row from being
   * silently overwritten, but only this lock stops the wasted double customer/session creation
   * itself and gives the loser a chance to re-read and reuse the winner's result instead of
   * proceeding on its own now-orphaned one. Transaction-scoped, released automatically on
   * commit/rollback.
   */
  async acquireCheckoutLock(tx: DrizzleTransaction, tenantId: string): Promise<void> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('billing:checkout'), hashtext(${tenantId}))`
    );
  }

  async insert(
    tx: DrizzleTransaction,
    input: InsertSubscriptionInput
  ): Promise<TenantSubscriptionRow> {
    const rows = await tx
      .insert(schema.tenantSubscriptions)
      .values({ tenantId: input.tenantId, planId: input.planId })
      .returning(SUBSCRIPTION_COLUMNS);

    const row = rows[0];
    if (!row) {
      throw new Error(MESSAGES.BILLING.FAILED_TO_CREATE_SUBSCRIPTION);
    }
    return row as TenantSubscriptionRow;
  }

  async findByTenantId(
    tenantId: string,
    tx?: DrizzleTransaction
  ): Promise<TenantSubscriptionRow | null> {
    const rows = await (tx ?? this.dbService.db)
      .select(SUBSCRIPTION_COLUMNS)
      .from(schema.tenantSubscriptions)
      .where(eq(schema.tenantSubscriptions.tenantId, tenantId))
      .limit(1);

    return (rows[0] as TenantSubscriptionRow | undefined) ?? null;
  }

  /** `tx` is optional — see `updateByTenantId`'s own comment. Webhook processing reads through the
   *  same transaction it will write in, so its decision is made against a consistent snapshot. */
  async findByStripeCustomerId(
    stripeCustomerId: string,
    tx?: DrizzleTransaction
  ): Promise<TenantSubscriptionRow | null> {
    const rows = await (tx ?? this.dbService.db)
      .select(SUBSCRIPTION_COLUMNS)
      .from(schema.tenantSubscriptions)
      .where(eq(schema.tenantSubscriptions.stripeCustomerId, stripeCustomerId))
      .limit(1);

    return (rows[0] as TenantSubscriptionRow | undefined) ?? null;
  }

  async findByStripeSubscriptionId(
    stripeSubscriptionId: string,
    tx?: DrizzleTransaction
  ): Promise<TenantSubscriptionRow | null> {
    const rows = await (tx ?? this.dbService.db)
      .select(SUBSCRIPTION_COLUMNS)
      .from(schema.tenantSubscriptions)
      .where(eq(schema.tenantSubscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1);

    return (rows[0] as TenantSubscriptionRow | undefined) ?? null;
  }

  /** `tx` is optional so webhook-driven writes (`BillingWebhooksService`) can run inside the
   *  caller's own transaction — see that class's own doc comment for why each handler's writes
   *  must commit atomically with the idempotency-ledger insert that guards them. */
  async updateByTenantId(
    tenantId: string,
    patch: TenantSubscriptionPatch,
    tx?: DrizzleTransaction
  ): Promise<TenantSubscriptionRow | null> {
    const rows = await (tx ?? this.dbService.db)
      .update(schema.tenantSubscriptions)
      .set({ ...patch, updatedAt: sql`now()` })
      .where(eq(schema.tenantSubscriptions.tenantId, tenantId))
      .returning(SUBSCRIPTION_COLUMNS);

    return (rows[0] as TenantSubscriptionRow | undefined) ?? null;
  }

  /**
   * Atomic conditional attach — `WHERE tenant_id = $1 AND stripe_customer_id IS NULL` closes the
   * TOCTOU race in `BillingService.createCheckoutSession`: two concurrent calls for a tenant with
   * no Stripe customer yet can both read `stripeCustomerId === null` and both mint a *different*
   * Stripe customer, then race to overwrite this column. Making the write itself conditional means
   * only the first one to commit actually attaches; the loser's `rows.length === 0` return tells
   * the caller someone else already won, so it can re-read and use that customer id instead of
   * silently orphaning its own newly-created one.
   */
  async attachStripeCustomerIdIfAbsent(
    tenantId: string,
    stripeCustomerId: string,
    tx?: DrizzleTransaction
  ): Promise<TenantSubscriptionRow | null> {
    const rows = await (tx ?? this.dbService.db)
      .update(schema.tenantSubscriptions)
      .set({ stripeCustomerId, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.tenantSubscriptions.tenantId, tenantId),
          isNull(schema.tenantSubscriptions.stripeCustomerId)
        )
      )
      .returning(SUBSCRIPTION_COLUMNS);

    return (rows[0] as TenantSubscriptionRow | undefined) ?? null;
  }

  /**
   * Stamps `stripe_last_verified_at` only — deliberately not `updated_at` too, since nothing about
   * the row's actual billing state changed; conflating the two would make `updated_at` lie about
   * when this row's business data last changed. A dedicated method rather than routing through
   * `updateByTenantId`'s generic patch, so every call site reads as "we just confirmed this
   * tenant against Stripe" rather than an easily-missed one-field patch object.
   */
  async touchStripeVerifiedAt(tenantId: string, tx?: DrizzleTransaction): Promise<void> {
    await (tx ?? this.dbService.db)
      .update(schema.tenantSubscriptions)
      .set({ stripeLastVerifiedAt: sql`now()` })
      .where(eq(schema.tenantSubscriptions.tenantId, tenantId));
  }

  /** Stamps `checkout_started_at` only — see `0011_billing.sql` for what reads it. `updated_at` is
   *  left alone for the same reason `touchStripeVerifiedAt` leaves it: no billing state changed. */
  async touchCheckoutStartedAt(tenantId: string, tx?: DrizzleTransaction): Promise<void> {
    await (tx ?? this.dbService.db)
      .update(schema.tenantSubscriptions)
      .set({ checkoutStartedAt: sql`now()` })
      .where(eq(schema.tenantSubscriptions.tenantId, tenantId));
  }

  /**
   * The candidate query for the periodic reconciliation sweep (`CronService
   * .reconcileStaleBillingSubscriptions`): tenants who have a Stripe customer id (meaning a
   * checkout was at least started) but are still on the `free` plan — the exact signature of "paid
   * on Stripe, this app never heard about it." No `LIMIT`, filter-driven, same shape as
   * `ConnectionsRepository.findLocationsDueForPoll`. The 1-hour floor on `stripeLastVerifiedAt`
   * just avoids re-checking a tenant the synchronous checkout-redirect path verified minutes ago.
   *
   * `checkout_started_at` within the last 4 days is what keeps this bounded: a Checkout Session
   * lives 24h and Stripe retries a failed webhook for up to 3 days, so past 4 days there is nothing
   * left to reconcile. Without it, every tenant that ever clicked Upgrade once would be re-queried
   * against Stripe on every nightly run, forever.
   */
  async findStaleFreeWithStripeCustomer(): Promise<
    { tenantId: string; stripeCustomerId: string }[]
  > {
    const rows = await this.dbService.db
      .select({
        tenantId: schema.tenantSubscriptions.tenantId,
        stripeCustomerId: schema.tenantSubscriptions.stripeCustomerId,
      })
      .from(schema.tenantSubscriptions)
      .innerJoin(schema.billingPlans, eq(schema.tenantSubscriptions.planId, schema.billingPlans.id))
      .where(
        and(
          isNotNull(schema.tenantSubscriptions.stripeCustomerId),
          eq(schema.billingPlans.code, BillingPlanCode.FREE),
          gt(schema.tenantSubscriptions.checkoutStartedAt, sql`now() - interval '4 days'`),
          or(
            isNull(schema.tenantSubscriptions.stripeLastVerifiedAt),
            lt(schema.tenantSubscriptions.stripeLastVerifiedAt, sql`now() - interval '1 hour'`)
          )
        )
      );

    // `stripeCustomerId` can't actually be null given the `isNotNull` filter above — Drizzle's
    // inferred column type is nullable regardless, since it doesn't narrow on a WHERE clause.
    return rows as { tenantId: string; stripeCustomerId: string }[];
  }
}
