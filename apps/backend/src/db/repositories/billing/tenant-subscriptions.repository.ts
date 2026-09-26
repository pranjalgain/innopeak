import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

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
}

export interface InsertSubscriptionInput {
  tenantId: string;
  planId: string;
}

/** Every field optional — callers (`TenantSubscriptionsDbService`) build a patch shaped for one
 *  webhook event at a time, never the whole row. */
export type TenantSubscriptionPatch = Partial<Omit<TenantSubscriptionRow, 'id' | 'tenantId'>>;

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
      throw new Error('Failed to create tenant subscription');
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
}
