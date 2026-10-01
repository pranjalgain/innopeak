import { MESSAGES } from '@common/constants/messages.constants';
import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import { DrizzleTransaction } from '@db/db.service';
import { Injectable } from '@nestjs/common';

import { BillingPlansRepository } from './billing-plans.repository';
import { TenantSubscriptionsRepository } from './tenant-subscriptions.repository';
import type {
  SetToPaidInput,
  SyncSubscriptionFieldsInput,
  TenantSubscriptionRow,
} from './types/billing.type';

/**
 * Composes `TenantSubscriptionsRepository` with `BillingPlansRepository` — every write here that
 * needs "the id of the free/paid plan" resolves it itself rather than pushing that lookup onto
 * `BillingWebhooksService`, per module-structure.md's "DB Service composes repository calls, no
 * business rules" split. The *decision* of which of these methods a given Stripe event calls is
 * still `BillingWebhooksService`'s job (see its own doc comment for the event -> method table) —
 * this class only knows how to perform each resulting state change, not when to.
 */
@Injectable()
export class TenantSubscriptionsDbService {
  constructor(
    private readonly tenantSubscriptionsRepository: TenantSubscriptionsRepository,
    private readonly billingPlansRepository: BillingPlansRepository
  ) {}

  findByTenantId(tenantId: string, tx?: DrizzleTransaction): Promise<TenantSubscriptionRow | null> {
    return this.tenantSubscriptionsRepository.findByTenantId(tenantId, tx);
  }

  findByStripeCustomerId(
    stripeCustomerId: string,
    tx?: DrizzleTransaction
  ): Promise<TenantSubscriptionRow | null> {
    return this.tenantSubscriptionsRepository.findByStripeCustomerId(stripeCustomerId, tx);
  }

  findByStripeSubscriptionId(
    stripeSubscriptionId: string,
    tx?: DrizzleTransaction
  ): Promise<TenantSubscriptionRow | null> {
    return this.tenantSubscriptionsRepository.findByStripeSubscriptionId(stripeSubscriptionId, tx);
  }

  /**
   * Opens one transaction for the whole checkout-session critical section, serialized per tenant
   * via `acquireCheckoutLock` — see that repository method's own doc comment for the double-click/
   * two-tab race this closes. `fn` receives the tx (to pass into any further tx-aware DbService
   * call, e.g. `attachStripeCustomerId`) and the tenant's current row (`null` only if the tenant
   * genuinely has none, which should never happen — every tenant gets one at signup).
   */
  withCheckoutLock<T>(
    tenantId: string,
    fn: (tx: DrizzleTransaction, subscription: TenantSubscriptionRow | null) => Promise<T>
  ): Promise<T> {
    return this.tenantSubscriptionsRepository.transaction(async tx => {
      await this.tenantSubscriptionsRepository.acquireCheckoutLock(tx, tenantId);
      const subscription = await this.tenantSubscriptionsRepository.findByTenantId(tenantId, tx);
      return fn(tx, subscription);
    });
  }

  /**
   * Called from inside `AuthDbService.signup`'s own transaction — `tx` is the caller's handle, not
   * one opened here, so the free subscription row commits atomically with the tenant/user rows it
   * belongs to (see that method's own doc comment for why: a tenant must never be observable
   * without one).
   */
  async insertFreeSubscription(
    tx: DrizzleTransaction,
    tenantId: string
  ): Promise<TenantSubscriptionRow> {
    const freePlan = await this.billingPlansRepository.findByCode(BillingPlanCode.FREE, tx);
    if (!freePlan) {
      // Never expected outside a broken/partial migration — 0011_billing.sql seeds both plans
      // unconditionally before this code path can ever run.
      throw new Error(MESSAGES.BILLING.FREE_PLAN_NOT_SEEDED);
    }
    return this.tenantSubscriptionsRepository.insert(tx, { tenantId, planId: freePlan.id });
  }

  /**
   * Persists the Stripe customer created ahead of a tenant's first Checkout session — happens
   * before any webhook fires, so `tenant_subscriptions.stripe_customer_id` is populated even
   * while the tenant is still on `free`, letting a later webhook resolve the tenant by customer
   * id no matter which event arrives first.
   *
   * Conditional (`WHERE stripe_customer_id IS NULL`, see
   * `TenantSubscriptionsRepository.attachStripeCustomerIdIfAbsent`) — called from inside
   * `BillingService.createCheckoutSession`'s per-tenant lock (`withCheckoutLock`), where it should
   * never actually lose a race, but stays conditional anyway as a second, independent guard against
   * ever silently overwriting an id some other write already attached.
   */
  attachStripeCustomerId(
    tenantId: string,
    stripeCustomerId: string,
    tx?: DrizzleTransaction
  ): Promise<TenantSubscriptionRow | null> {
    return this.tenantSubscriptionsRepository.attachStripeCustomerIdIfAbsent(
      tenantId,
      stripeCustomerId,
      tx
    );
  }

  /** `checkout.session.completed` — the one write that moves `plan_id` to `paid`. `tx` threads
   *  through so `BillingWebhooksService` can commit this atomically with the idempotency-ledger
   *  insert that guards it — see that class's own doc comment. */
  async setToPaidFromCheckout(
    tenantId: string,
    input: SetToPaidInput,
    tx?: DrizzleTransaction
  ): Promise<TenantSubscriptionRow | null> {
    const paidPlan = await this.billingPlansRepository.findByCode(BillingPlanCode.PAID, tx);
    if (!paidPlan) {
      throw new Error(MESSAGES.BILLING.PAID_PLAN_NOT_SEEDED);
    }
    return this.tenantSubscriptionsRepository.updateByTenantId(
      tenantId,
      {
        planId: paidPlan.id,
        stripeSubscriptionId: input.stripeSubscriptionId,
        status: input.status,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      },
      tx
    );
  }

  /**
   * `customer.subscription.updated` — status/period/cancel-flag sync only. Deliberately never
   * touches `plan_id`: a tenant who canceled but is still inside their paid period arrives here
   * with `cancelAtPeriodEnd: true` and must keep reading as `paid` with unlimited entitlements
   * until `customer.subscription.deleted` actually ends it — see `BillingWebhooksService`.
   */
  syncSubscriptionFields(
    tenantId: string,
    input: SyncSubscriptionFieldsInput,
    tx?: DrizzleTransaction
  ): Promise<TenantSubscriptionRow | null> {
    return this.tenantSubscriptionsRepository.updateByTenantId(
      tenantId,
      {
        status: input.status,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      },
      tx
    );
  }

  /** `customer.subscription.deleted` — the one write that restores Free's limits. Clears every
   *  Stripe-specific field: a fresh future upgrade starts a brand new Checkout Session / Stripe
   *  subscription, not a resumed one. `stripe_customer_id` is deliberately left alone — the
   *  customer object itself still exists in Stripe and a future re-upgrade should reuse it rather
   *  than mint a second one for the same tenant. */
  async setToFreeFromSubscriptionDeleted(
    tenantId: string,
    tx?: DrizzleTransaction
  ): Promise<TenantSubscriptionRow | null> {
    const freePlan = await this.billingPlansRepository.findByCode(BillingPlanCode.FREE, tx);
    if (!freePlan) {
      throw new Error(MESSAGES.BILLING.FREE_PLAN_NOT_SEEDED);
    }
    return this.tenantSubscriptionsRepository.updateByTenantId(
      tenantId,
      {
        planId: freePlan.id,
        stripeSubscriptionId: null,
        status: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      },
      tx
    );
  }

  /** `invoice.payment_failed` / `invoice.payment_succeeded` — status only, per the plan's v1 scope
   *  (no email queuing on invoice events). */
  updateStatus(
    tenantId: string,
    status: SubscriptionStatus,
    tx?: DrizzleTransaction
  ): Promise<TenantSubscriptionRow | null> {
    return this.tenantSubscriptionsRepository.updateByTenantId(tenantId, { status }, tx);
  }
}
