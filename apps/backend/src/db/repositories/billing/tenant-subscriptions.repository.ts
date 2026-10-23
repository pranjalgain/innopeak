import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { MESSAGES } from '@common/constants/messages.constants';
import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { LocationStatus } from '@common/enums/location-status.enum';
import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';

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
  cancellationSource: schema.tenantSubscriptions.cancellationSource,
  stripeLastVerifiedAt: schema.tenantSubscriptions.stripeLastVerifiedAt,
  checkoutStartedAt: schema.tenantSubscriptions.checkoutStartedAt,
} as const;

/** One row per tenant, always present (created at signup on free), so plan lookups need no null-check. Mechanical queries only; webhook rules live in BillingWebhooksService. */
@Injectable()
export class TenantSubscriptionsRepository {
  constructor(private readonly dbService: DBService) {}

  transaction<T>(fn: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
    return this.dbService.db.transaction(fn);
  }

  /** Transaction-scoped lock serializing createCheckoutSession per tenant, so concurrent attempts don't each mint a different Stripe customer/session. */
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

  /** Webhook processing reads through the transaction it writes in, for a consistent snapshot. */
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

  /** `tx` lets webhook writes commit atomically with the idempotency-ledger insert that guards them. */
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

  /** Atomic `WHERE stripe_customer_id IS NULL` closes the race where concurrent checkouts each mint a customer; `rows.length === 0` tells the loser to re-read the winner's id. */
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

  /** Stamps `stripe_last_verified_at` only, not `updated_at`: no billing state changed. */
  async touchStripeVerifiedAt(tenantId: string, tx?: DrizzleTransaction): Promise<void> {
    await (tx ?? this.dbService.db)
      .update(schema.tenantSubscriptions)
      .set({ stripeLastVerifiedAt: sql`now()` })
      .where(eq(schema.tenantSubscriptions.tenantId, tenantId));
  }

  /**
   * Moves the "newest Stripe event applied" clock forward to `eventCreatedAt`, atomically. `false` means a newer event
   * was already applied, so this one is stale and the caller must not write its (older) state. An event created in the
   * same second as the last one counts as current: Stripe's `created` has second resolution, so there is no order to
   * recover between them. The row update also serializes concurrent deliveries for the same tenant.
   */
  async advanceEventClock(
    tenantId: string,
    eventCreatedAt: string,
    tx?: DrizzleTransaction
  ): Promise<boolean> {
    const rows = await (tx ?? this.dbService.db)
      .update(schema.tenantSubscriptions)
      .set({ stripeLastEventAt: eventCreatedAt })
      .where(
        and(
          eq(schema.tenantSubscriptions.tenantId, tenantId),
          or(
            isNull(schema.tenantSubscriptions.stripeLastEventAt),
            lte(schema.tenantSubscriptions.stripeLastEventAt, eventCreatedAt)
          )
        )
      )
      .returning({ tenantId: schema.tenantSubscriptions.tenantId });
    return rows.length > 0;
  }

  /** Stamps `checkout_started_at` only, not `updated_at`, for the same reason. */
  async touchCheckoutStartedAt(tenantId: string, tx?: DrizzleTransaction): Promise<void> {
    await (tx ?? this.dbService.db)
      .update(schema.tenantSubscriptions)
      .set({ checkoutStartedAt: sql`now()` })
      .where(eq(schema.tenantSubscriptions.tenantId, tenantId));
  }

  /** Free tenants with more active, unpaused locations than the Free plan allows (e.g. added while limits were lifted). */
  async findFreeTenantIdsOverLocationCap(): Promise<string[]> {
    const rows = await this.dbService.db
      .select({ tenantId: schema.tenantSubscriptions.tenantId })
      .from(schema.tenantSubscriptions)
      .innerJoin(schema.billingPlans, eq(schema.tenantSubscriptions.planId, schema.billingPlans.id))
      .innerJoin(
        schema.locations,
        and(
          eq(schema.locations.tenantId, schema.tenantSubscriptions.tenantId),
          eq(schema.locations.status, LocationStatus.ACTIVE),
          isNull(schema.locations.billingPausedAt)
        )
      )
      .where(
        and(
          eq(schema.billingPlans.code, BillingPlanCode.FREE),
          isNotNull(schema.billingPlans.maxLocations)
        )
      )
      .groupBy(schema.tenantSubscriptions.tenantId, schema.billingPlans.maxLocations)
      .having(sql`count(${schema.locations.id}) > ${schema.billingPlans.maxLocations}`);

    return rows.map(row => row.tenantId);
  }

  /**
   * Businesses waiting out an erasure grace period whose subscription may still be billing: a Stripe customer exists and either no
   * subscription is recorded (a checkout whose webhook has not landed) or a live one is not set to end. The request-time cancellation is
   * best-effort and logs a failure, so this is what retries it; it leaves out anything already ending, which resuming would undo.
   */
  async findPendingErasureWithBillableSubscription(): Promise<string[]> {
    const rows = await this.dbService.db
      .select({ tenantId: schema.tenantSubscriptions.tenantId })
      .from(schema.tenantSubscriptions)
      .innerJoin(schema.tenants, eq(schema.tenants.id, schema.tenantSubscriptions.tenantId))
      .where(
        and(
          eq(schema.tenants.status, TenantStatus.SUSPENDED),
          isNotNull(schema.tenants.erasureRequestedAt),
          isNotNull(schema.tenantSubscriptions.stripeCustomerId),
          or(
            isNull(schema.tenantSubscriptions.stripeSubscriptionId),
            and(
              inArray(schema.tenantSubscriptions.status, [
                SubscriptionStatus.ACTIVE,
                SubscriptionStatus.PAST_DUE,
              ]),
              eq(schema.tenantSubscriptions.cancelAtPeriodEnd, false)
            )
          )
        )
      );

    return rows.map(row => row.tenantId);
  }

  /**
   * Reconciliation-sweep candidates: a Stripe customer exists but the tenant is still on free ("paid on Stripe, never heard
   * about it"). The 1-hour `stripeLastVerifiedAt` floor skips tenants the checkout redirect just verified. A
   * `checkout_started_at` within 4 days bounds the sweep: a Checkout Session lives 24h and Stripe retries webhooks up to 3 days.
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

    // Drizzle's inferred type stays nullable despite the isNotNull filter.
    return rows as { tenantId: string; stripeCustomerId: string }[];
  }
}
