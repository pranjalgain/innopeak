import { SubscriptionCancellationSource } from '@common/enums/subscription-cancellation-source.enum';
import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import { DBService } from '@db/db.service';
import { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { Injectable } from '@nestjs/common';

import { CheckoutSessionTenantMismatchException } from '../exceptions/billing.exceptions';
import { PaymentProvider } from '../providers/payment.provider';
import type { SubscriptionSnapshot } from '../types/billing.type';
import { isResourceMissing } from '../utils/stripe-error.util';

export interface ReconcileFromCheckoutSessionInput {
  tenantId: string;
  checkoutSessionId: string;
}

export interface ReconcileTenantSubscriptionInput {
  tenantId: string;
  stripeCustomerId: string;
}

/**
 * Asks Stripe what is true when there is no webhook payload (checkout redirect, periodic sweep).
 * Ends in the same `setToPaidFromCheckout` as the webhook path, which is a repeat-safe UPDATE, so
 * all paths converge. `stripe_last_verified_at` is stamped even when Stripe has no active
 * subscription, which stops the sweep re-checking a genuinely free tenant every run.
 */
@Injectable()
export class BillingReconciliationService {
  constructor(
    private readonly dbService: DBService,
    private readonly paymentProvider: PaymentProvider,
    private readonly tenantSubscriptionsDbService: TenantSubscriptionsDbService,
    private readonly connectionsDbService: ConnectionsDbService
  ) {}

  /**
   * The session's tenantId must match the caller's, or one tenant could probe another's checkout
   * by session id. A session with no subscription yet (abandoned, or Stripe still processing) is
   * not an error.
   */
  async reconcileFromCheckoutSession(input: ReconcileFromCheckoutSessionInput): Promise<void> {
    const session = await this.paymentProvider.retrieveCheckoutSession(input.checkoutSessionId);
    if (session.tenantId !== input.tenantId) {
      throw new CheckoutSessionTenantMismatchException();
    }

    await this.applySnapshotOrTouch(input.tenantId, session.subscription);
  }

  /**
   * Called when an erasure is requested:
   * - `active`: cancel at period end, source `'erasure'`, so the plan survives if the request is
   *   cancelled (the grace period can be 21 days, long enough to be billed again).
   * - `past_due`: cancel now and void open invoices; Stripe would otherwise keep retrying the card.
   * - already ending (owner cancelled): left alone, so cancelling the erasure can't resume it.
   *
   * A subscription Stripe no longer has counts as done. Other failures rethrow; the caller treats
   * it as best-effort since the purge deletes the customer anyway.
   */
  async scheduleCancellationForErasure(tenantId: string): Promise<void> {
    const row = await this.tenantSubscriptionsDbService.findByTenantId(tenantId);
    const subscriptionId = row?.stripeSubscriptionId;
    const isLive =
      row?.status === SubscriptionStatus.ACTIVE || row?.status === SubscriptionStatus.PAST_DUE;
    if (!row || !subscriptionId || !isLive) {
      return;
    }

    if (row.status === SubscriptionStatus.PAST_DUE) {
      await this.endSubscriptionNow(subscriptionId);
      return;
    }

    if (row.cancelAtPeriodEnd) {
      return;
    }

    // Recorded first and reverted on failure, so the following subscription.updated never finds an ending subscription with no source.
    await this.tenantSubscriptionsDbService.markCancellationScheduled(
      tenantId,
      SubscriptionCancellationSource.ERASURE
    );
    try {
      await this.paymentProvider.cancelSubscription(subscriptionId, true);
    } catch (error) {
      await this.tenantSubscriptionsDbService.clearCancellationScheduled(tenantId);
      if (!isResourceMissing(error)) {
        throw error;
      }
      return;
    }
    // Webhooks are unordered: a stale subscription.updated (flag still false) can land before
    // Stripe confirms and clear the source (see syncSubscriptionFields), so re-assert it here.
    await this.tenantSubscriptionsDbService.markCancellationScheduled(
      tenantId,
      SubscriptionCancellationSource.ERASURE
    );
  }

  /**
   * Resumes only if erasure set the subscription to end, it is still ending, and the paid period
   * hasn't run out. An owner's own cancellation is never resumed (it would charge them).
   */
  async resumeAfterErasureCancelled(tenantId: string): Promise<void> {
    const row = await this.tenantSubscriptionsDbService.findByTenantId(tenantId);
    const subscriptionId = row?.stripeSubscriptionId;
    if (
      !row ||
      !subscriptionId ||
      !row.cancelAtPeriodEnd ||
      row.cancellationSource !== SubscriptionCancellationSource.ERASURE ||
      row.status !== SubscriptionStatus.ACTIVE
    ) {
      return;
    }

    if (row.currentPeriodEnd !== null && new Date(row.currentPeriodEnd).getTime() <= Date.now()) {
      return;
    }

    try {
      await this.paymentProvider.resumeSubscription(subscriptionId);
    } catch (error) {
      if (!isResourceMissing(error)) {
        throw error;
      }
    }
    await this.tenantSubscriptionsDbService.clearCancellationScheduled(tenantId);
  }

  /** Stripe's `customer.subscription.deleted` webhook then moves the tenant to Free. */
  private async endSubscriptionNow(subscriptionId: string): Promise<void> {
    try {
      await this.paymentProvider.cancelSubscription(subscriptionId, false);
    } catch (error) {
      if (!isResourceMissing(error)) {
        throw error;
      }
    }
    await this.paymentProvider.voidOpenInvoices(subscriptionId);
  }

  /**
   * Deleting the Stripe customer ends any subscription and removes the owner's name and email from
   * Stripe. Idempotent; rethrows so the purge skips the tenant and retries tomorrow rather than
   * erasing first and being unable to stop billing.
   */
  async releaseBillingForErasure(tenantId: string): Promise<void> {
    const row = await this.tenantSubscriptionsDbService.findByTenantId(tenantId);
    if (!row?.stripeCustomerId) {
      return;
    }
    await this.paymentProvider.deleteCustomer(row.stripeCustomerId);
  }

  /** Takes the row shape `findStaleFreeWithStripeCustomer` returns, so the cron can pass a candidate straight through. */
  async reconcileTenantSubscription(input: ReconcileTenantSubscriptionInput): Promise<void> {
    const subscription = await this.paymentProvider.retrieveActiveSubscriptionForCustomer(
      input.stripeCustomerId
    );
    await this.applySnapshotOrTouch(input.tenantId, subscription);
  }

  /**
   * Only a live subscription (`active`/`past_due`) is applied: a `canceled` one (e.g. a replayed
   * success URL) would resurrect Paid for a non-paying tenant, and `incomplete` means no payment
   * yet. Those only get the verified stamp.
   *
   * One transaction for all writes: a failure after `setToPaidFromCheckout` would leave a Paid
   * tenant with billing-paused locations that the nightly sweep never revisits.
   */
  private async applySnapshotOrTouch(
    tenantId: string,
    subscription: SubscriptionSnapshot | null
  ): Promise<void> {
    const isLive =
      subscription !== null &&
      (subscription.status === SubscriptionStatus.ACTIVE ||
        subscription.status === SubscriptionStatus.PAST_DUE);

    await this.dbService.db.transaction(async tx => {
      if (isLive) {
        await this.tenantSubscriptionsDbService.setToPaidFromCheckout(tenantId, subscription, tx);
        // Paid has no location cap.
        await this.connectionsDbService.clearBillingPauseForTenant(tenantId, tx);
      }

      await this.tenantSubscriptionsDbService.touchStripeVerifiedAt(tenantId, tx);
    });
  }
}
