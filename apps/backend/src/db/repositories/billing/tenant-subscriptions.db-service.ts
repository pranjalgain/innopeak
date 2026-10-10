import { MESSAGES } from '@common/constants/messages.constants';
import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import type { SubscriptionCancellationSource } from '@common/enums/subscription-cancellation-source.enum';
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

/** Resolves the free/paid plan ids itself so BillingWebhooksService doesn't; that service decides which method to call, this only performs the state change. */
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

  /** One transaction serialized per tenant via acquireCheckoutLock (closes the double-click/two-tab race); `fn` gets the tx and the tenant's row. */
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

  /** Runs in AuthDbService.signup's transaction so a tenant is never observable without a subscription row. */
  async insertFreeSubscription(
    tx: DrizzleTransaction,
    tenantId: string
  ): Promise<TenantSubscriptionRow> {
    const freePlan = await this.billingPlansRepository.findByCode(BillingPlanCode.FREE, tx);
    if (!freePlan) {
      // Only possible with a broken migration; 0011_billing.sql seeds both plans.
      throw new Error(MESSAGES.BILLING.FREE_PLAN_NOT_SEEDED);
    }
    return this.tenantSubscriptionsRepository.insert(tx, { tenantId, planId: freePlan.id });
  }

  /**
   * Persisted before any webhook fires so a later webhook can resolve the tenant by customer id regardless of event
   * order. Conditional as a second guard against overwriting an id some other write already attached.
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

  /** The one write that moves `plan_id` to paid; `tx` lets the webhook commit it with the idempotency-ledger insert. */
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
        cancellationSource: null,
      },
      tx
    );
  }

  /** Status/period/cancel-flag sync only; never touches `plan_id`, so a canceled tenant still inside their paid period stays paid until `customer.subscription.deleted`. */
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
        // Cleared once no longer ending (resumed, erasure cancelled); while ending the source stays as
        // markCancellationScheduled wrote it, since a webhook can't know who asked.
        ...(input.cancelAtPeriodEnd ? {} : { cancellationSource: null }),
      },
      tx
    );
  }

  /**
   * Records that we asked the provider to end this at period end, and why. Written before the provider call (reverted on
   * failure) so the following webhook always finds a source.
   */
  markCancellationScheduled(
    tenantId: string,
    source: SubscriptionCancellationSource
  ): Promise<TenantSubscriptionRow | null> {
    return this.tenantSubscriptionsRepository.updateByTenantId(tenantId, {
      cancelAtPeriodEnd: true,
      cancellationSource: source,
    });
  }

  clearCancellationScheduled(tenantId: string): Promise<TenantSubscriptionRow | null> {
    return this.tenantSubscriptionsRepository.updateByTenantId(tenantId, {
      cancelAtPeriodEnd: false,
      cancellationSource: null,
    });
  }

  /** Restores Free's limits and clears Stripe-specific fields (a re-upgrade starts a new subscription); keeps `stripe_customer_id` so the customer is reused. */
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
        cancellationSource: null,
      },
      tx
    );
  }

  /** Status only; no email queuing on invoice events. */
  updateStatus(
    tenantId: string,
    status: SubscriptionStatus,
    tx?: DrizzleTransaction
  ): Promise<TenantSubscriptionRow | null> {
    return this.tenantSubscriptionsRepository.updateByTenantId(tenantId, { status }, tx);
  }

  touchStripeVerifiedAt(tenantId: string, tx?: DrizzleTransaction): Promise<void> {
    return this.tenantSubscriptionsRepository.touchStripeVerifiedAt(tenantId, tx);
  }

  touchCheckoutStartedAt(tenantId: string, tx?: DrizzleTransaction): Promise<void> {
    return this.tenantSubscriptionsRepository.touchCheckoutStartedAt(tenantId, tx);
  }

  findFreeTenantIdsOverLocationCap(): Promise<string[]> {
    return this.tenantSubscriptionsRepository.findFreeTenantIdsOverLocationCap();
  }

  findStaleFreeWithStripeCustomer(): Promise<{ tenantId: string; stripeCustomerId: string }[]> {
    return this.tenantSubscriptionsRepository.findStaleFreeWithStripeCustomer();
  }
}
