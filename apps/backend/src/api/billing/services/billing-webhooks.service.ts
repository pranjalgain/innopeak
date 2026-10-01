import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import { DBService, DrizzleTransaction } from '@db/db.service';
import { BillingReceiptsDbService } from '@db/repositories/billing/billing-receipts.db-service';
import { StripeWebhookEventsDbService } from '@db/repositories/billing/stripe-webhook-events.db-service';
import { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import type { TenantSubscriptionRow } from '@db/repositories/billing/types/billing.type';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { Injectable, Logger } from '@nestjs/common';

import { BillingEntitlementsService } from './billing-entitlements.service';

import type { PaymentWebhookEvent } from '../types/billing.type';

/**
 * The Stripe-facing half of the module — idempotency, then the per-event-type state machine.
 * **Downgrade-to-free on cancellation is explicit, not implied by status alone**:
 *
 * | Event | Effect |
 * |---|---|
 * | `checkout.session.completed` | Attach `stripe_subscription_id`, set `plan_id` to `paid`, clear `billing_paused_at` on every one of the tenant's locations (Paid has no cap). |
 * | `customer.subscription.updated` | Sync `status`/period/`cancel_at_period_end` only. A tenant who canceled but is still in their paid period arrives here with `cancel_at_period_end: true` and `status: 'active'` — `plan_id` **stays** `paid` and entitlements stay unlimited; they keep what they already paid for. |
 * | `customer.subscription.deleted` | Fires when Stripe actually ends the subscription (period end, or immediate). **This is the one write that flips `plan_id` back to `free`** and clears `stripe_subscription_id`/`status`/period fields — entitlement checks read `plan_id`, not `status`, so forgetting this would leave a canceled tenant permanently reading as `paid`. Also runs `BillingEntitlementsService.enforceLocationLimitOnDowngrade`. |
 * | `invoice.payment_failed` | `status` only — no email queuing in v1. |
 * | `invoice.payment_succeeded` | `status`, plus a `billing_receipts` row (amount/currency/invoice number) so the tenant can download a PDF receipt — see `0012_billing_receipts.sql`. |
 *
 * Every branch resolves the tenant by Stripe id and no-ops (with a warning logged) if none is
 * found, rather than throwing — an orphan event (a customer/subscription this app never created,
 * or a race with an as-yet-uncommitted Checkout) must not fail the webhook and trigger endless
 * Stripe retries for something that will never resolve.
 *
 * **One transaction per delivery.** `handleEvent` opens a single `DBService.db.transaction(...)`
 * spanning the idempotency-ledger insert (`stripeWebhookEventsDbService.recordIfNew`) AND every
 * state-changing write the event's handler makes, all threaded through the same `tx`. Previously
 * the ledger insert committed on its own, ahead of the handler's writes: if the process crashed or
 * a write threw partway through a handler (e.g. `setToPaidFromCheckout` succeeding but
 * `clearBillingPauseForTenant` failing), the event was already marked "processed" and Stripe's
 * retry would see that and silently skip it forever, permanently losing the missed write with no
 * recovery path. Wrapping the ledger insert in the same transaction as the writes it guards means a
 * failure anywhere rolls the whole thing back, including the ledger row — so a retry actually
 * retries.
 */
@Injectable()
export class BillingWebhooksService {
  private readonly logger = new Logger(BillingWebhooksService.name);

  constructor(
    private readonly dbService: DBService,
    private readonly stripeWebhookEventsDbService: StripeWebhookEventsDbService,
    private readonly tenantSubscriptionsDbService: TenantSubscriptionsDbService,
    private readonly connectionsDbService: ConnectionsDbService,
    private readonly billingEntitlementsService: BillingEntitlementsService,
    private readonly billingReceiptsDbService: BillingReceiptsDbService
  ) {}

  async handleEvent(event: PaymentWebhookEvent): Promise<void> {
    const rawType = event.type === 'unhandled' ? event.rawType : event.type;
    const customerId = event.type === 'unhandled' ? null : event.customerId;

    await this.dbService.db.transaction(async tx => {
      // Insert-first, ON CONFLICT DO NOTHING — 0 rows returned means this event id was already
      // processed (a duplicate delivery, Stripe's own retry behavior), and it must be skipped. Runs
      // inside this same transaction — see this class's own doc comment for why.
      const isNew = await this.stripeWebhookEventsDbService.recordIfNew(
        event.id,
        rawType,
        customerId,
        tx
      );
      if (!isNew) {
        this.logger.debug(`Skipping duplicate Stripe webhook event ${event.id} (${rawType})`);
        return;
      }

      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutCompleted(tx, event);
          return;
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(tx, event);
          return;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(tx, event);
          return;
        case 'invoice.payment_failed':
          await this.syncStatusByCustomerId(tx, event.customerId, SubscriptionStatus.PAST_DUE);
          return;
        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(tx, event);
          return;
        case 'unhandled':
          this.logger.debug(`Ignoring unhandled Stripe event type ${event.rawType}`);
          return;
      }
    });
  }

  private async handleCheckoutCompleted(
    tx: DrizzleTransaction,
    event: Extract<PaymentWebhookEvent, { type: 'checkout.session.completed' }>
  ): Promise<void> {
    const subscription = await this.requireSubscriptionByCustomerId(tx, event.customerId);
    if (!subscription) {
      return;
    }

    await this.tenantSubscriptionsDbService.setToPaidFromCheckout(
      subscription.tenantId,
      {
        stripeSubscriptionId: event.subscriptionId,
        status: event.status,
        currentPeriodStart: event.currentPeriodStart,
        currentPeriodEnd: event.currentPeriodEnd,
        cancelAtPeriodEnd: false,
      },
      tx
    );

    // Paid has no location cap — see §3a's final paragraph in the plan.
    await this.connectionsDbService.clearBillingPauseForTenant(subscription.tenantId, tx);
  }

  private async handleSubscriptionUpdated(
    tx: DrizzleTransaction,
    event: Extract<PaymentWebhookEvent, { type: 'customer.subscription.updated' }>
  ): Promise<void> {
    const subscription = await this.resolveSubscription(tx, event.customerId, event.subscriptionId);
    if (!subscription) {
      return;
    }

    // `plan_id` is deliberately untouched here — see this class's own doc comment table.
    await this.tenantSubscriptionsDbService.syncSubscriptionFields(
      subscription.tenantId,
      {
        status: event.status,
        currentPeriodStart: event.currentPeriodStart,
        currentPeriodEnd: event.currentPeriodEnd,
        cancelAtPeriodEnd: event.cancelAtPeriodEnd,
      },
      tx
    );
  }

  private async handleSubscriptionDeleted(
    tx: DrizzleTransaction,
    event: Extract<PaymentWebhookEvent, { type: 'customer.subscription.deleted' }>
  ): Promise<void> {
    const subscription = await this.resolveSubscription(tx, event.customerId, event.subscriptionId);
    if (!subscription) {
      return;
    }

    await this.tenantSubscriptionsDbService.setToFreeFromSubscriptionDeleted(
      subscription.tenantId,
      tx
    );
    await this.billingEntitlementsService.enforceLocationLimitOnDowngrade(
      subscription.tenantId,
      tx
    );
  }

  /** Syncs status (unchanged from before) and additionally records a `billing_receipts` row so the
   *  tenant can download a PDF for this payment — see `0012_billing_receipts.sql`. The insert is
   *  idempotent on `stripe_invoice_id`, so a retried delivery of the same event (this method only
   *  runs once per event id anyway, per `handleEvent`'s own dedup) can never double-record. */
  private async handleInvoicePaymentSucceeded(
    tx: DrizzleTransaction,
    event: Extract<PaymentWebhookEvent, { type: 'invoice.payment_succeeded' }>
  ): Promise<void> {
    const subscription = await this.requireSubscriptionByCustomerId(tx, event.customerId);
    if (!subscription) {
      return;
    }

    await this.tenantSubscriptionsDbService.updateStatus(
      subscription.tenantId,
      SubscriptionStatus.ACTIVE,
      tx
    );

    await this.billingReceiptsDbService.recordIfNew(
      {
        tenantId: subscription.tenantId,
        stripeInvoiceId: event.invoiceId,
        stripeSubscriptionId: event.subscriptionId,
        amountPaid: event.amountPaid,
        currency: event.currency,
        invoiceNumber: event.invoiceNumber,
        paidAt: event.paidAt,
      },
      tx
    );
  }

  private async syncStatusByCustomerId(
    tx: DrizzleTransaction,
    customerId: string,
    status: SubscriptionStatus
  ): Promise<void> {
    const subscription = await this.requireSubscriptionByCustomerId(tx, customerId);
    if (!subscription) {
      return;
    }
    await this.tenantSubscriptionsDbService.updateStatus(subscription.tenantId, status, tx);
  }

  /**
   * Prefers the Stripe subscription id (unambiguous, one row) and falls back to the customer id —
   * a `customer.subscription.updated`/`.deleted` for a subscription this row hasn't recorded yet
   * (e.g. delivered out of order relative to `checkout.session.completed`) can still resolve the
   * tenant by customer id alone.
   *
   * That same fallback, unguarded, used to be able to apply a STALE event: Stripe does not
   * guarantee delivery order, so a delayed `.deleted` for a subscription the tenant has since
   * canceled-and-resubscribed past (a newer `stripeSubscriptionId` already attached) could resolve
   * by customer id and wipe the tenant's *current, active* subscription back to Free. The check
   * below closes that: once the customer-id fallback finds a row that already points at a
   * *different*, non-null subscription id than the one this event describes, the event is for a
   * subscription Stripe has since superseded — no-op instead of applying it.
   */
  private async resolveSubscription(
    tx: DrizzleTransaction,
    customerId: string,
    subscriptionId: string
  ): Promise<TenantSubscriptionRow | null> {
    const bySubscriptionId = await this.tenantSubscriptionsDbService.findByStripeSubscriptionId(
      subscriptionId,
      tx
    );
    if (bySubscriptionId) {
      return bySubscriptionId;
    }

    const byCustomerId = await this.requireSubscriptionByCustomerId(tx, customerId);
    if (!byCustomerId) {
      return null;
    }

    if (
      byCustomerId.stripeSubscriptionId !== null &&
      byCustomerId.stripeSubscriptionId !== subscriptionId
    ) {
      this.logger.warn(
        `Ignoring stale Stripe event for subscription ${subscriptionId} — tenant ` +
          `${byCustomerId.tenantId} is now on ${byCustomerId.stripeSubscriptionId}.`
      );
      return null;
    }

    return byCustomerId;
  }

  private async requireSubscriptionByCustomerId(
    tx: DrizzleTransaction,
    customerId: string
  ): Promise<TenantSubscriptionRow | null> {
    const subscription = await this.tenantSubscriptionsDbService.findByStripeCustomerId(
      customerId,
      tx
    );
    if (!subscription) {
      this.logger.warn(
        `No tenant_subscriptions row found for Stripe customer ${customerId} — ignoring event.`
      );
      return null;
    }
    return subscription;
  }
}
