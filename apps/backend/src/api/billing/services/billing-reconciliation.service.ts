import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import { DBService } from '@db/db.service';
import { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { Injectable } from '@nestjs/common';

import { CheckoutSessionTenantMismatchException } from '../exceptions/billing.exceptions';
import { PaymentProvider } from '../providers/payment.provider';
import type { SubscriptionSnapshot } from '../types/billing.type';

export interface ReconcileFromCheckoutSessionInput {
  tenantId: string;
  checkoutSessionId: string;
}

export interface ReconcileTenantSubscriptionInput {
  tenantId: string;
  stripeCustomerId: string;
}

/**
 * The "we don't have a webhook payload, go ask Stripe what's actually true" half of billing —
 * deliberately separate from `BillingWebhooksService`, which already has a trustworthy event
 * payload and needs none of this. Two entry points, one shared outcome:
 *
 * - `reconcileFromCheckoutSession` — the synchronous checkout-redirect path (`POST
 *   /v1/billing/checkout/reconcile`), for a tenant who comes back to the success page before (or
 *   without ever) receiving `checkout.session.completed`.
 * - `reconcileTenantSubscription` — the periodic sweep's own per-candidate primitive
 *   (`CronService.reconcileStaleBillingSubscriptions`), for a tenant who never comes back at all.
 *
 * Both end up calling `TenantSubscriptionsDbService.setToPaidFromCheckout` — the exact same method
 * `BillingWebhooksService.handleCheckoutCompleted` calls — so all three paths converge on
 * identical state regardless of which one runs first; that method is a plain `UPDATE` by
 * `tenantId`, already safe to call more than once. `stripe_last_verified_at` is stamped either way,
 * including when Stripe genuinely has no active subscription yet — a confirmed-still-free tenant
 * is as much a verification as a confirmed-now-paid one, and is what stops the sweep from
 * re-checking the same genuinely-free tenant on every run.
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
   * Verifies `session.metadata.tenantId` (set by `createCheckoutSession`) matches the
   * authenticated caller's own tenant before applying anything — otherwise one tenant could probe
   * another's checkout outcome by guessing/observing a session id. A session with no subscription
   * yet (an abandoned checkout, or the browser landing here before Stripe has actually finished
   * processing) is not an error — it just means there is nothing to apply yet.
   */
  async reconcileFromCheckoutSession(input: ReconcileFromCheckoutSessionInput): Promise<void> {
    const session = await this.paymentProvider.retrieveCheckoutSession(input.checkoutSessionId);
    if (session.tenantId !== input.tenantId) {
      throw new CheckoutSessionTenantMismatchException();
    }

    await this.applySnapshotOrTouch(input.tenantId, session.subscription);
  }

  /** The sweep's per-candidate primitive — `stripeCustomerId` is enough to ask Stripe directly,
   *  with no session id involved at all. Takes the exact shape
   *  `TenantSubscriptionsRepository.findStaleFreeWithStripeCustomer` returns per row, so
   *  `CronService` can pass a candidate straight through with no destructuring. */
  async reconcileTenantSubscription(input: ReconcileTenantSubscriptionInput): Promise<void> {
    const subscription = await this.paymentProvider.retrieveActiveSubscriptionForCustomer(
      input.stripeCustomerId
    );
    await this.applySnapshotOrTouch(input.tenantId, subscription);
  }

  /**
   * Only a *live* subscription (`active`, or `past_due` — still billed, just behind) is applied.
   * A `canceled` one means the subscription this session created has since ended (an old success
   * URL replayed from history, say) and applying it would resurrect Paid for a tenant who is not
   * paying; an `incomplete` one means the first payment hasn't actually been captured yet. Both
   * fall through to the verified-stamp-only branch, same as "no subscription at all".
   *
   * One transaction for all three writes, like the webhook path's — otherwise a failure after
   * `setToPaidFromCheckout` would leave a Paid tenant whose locations stay billing-paused, and
   * since they are no longer on the free plan the nightly sweep would never revisit them.
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
        // Paid has no location cap — see §3a's final paragraph in the plan, same as
        // `BillingWebhooksService.handleCheckoutCompleted`.
        await this.connectionsDbService.clearBillingPauseForTenant(tenantId, tx);
      }

      await this.tenantSubscriptionsDbService.touchStripeVerifiedAt(tenantId, tx);
    });
  }
}
