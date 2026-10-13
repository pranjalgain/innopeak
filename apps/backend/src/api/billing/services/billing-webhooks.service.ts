import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import { DBService, DrizzleTransaction } from '@db/db.service';
import { BillingReceiptsDbService } from '@db/repositories/billing/billing-receipts.db-service';
import { StripeWebhookEventsDbService } from '@db/repositories/billing/stripe-webhook-events.db-service';
import { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import type { TenantSubscriptionRow } from '@db/repositories/billing/types/billing.type';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { Injectable, Logger } from '@nestjs/common';

import { BillingEntitlementsService } from './billing-entitlements.service';

import { UNKNOWN_CUSTOMER_RETRY_GRACE_MS } from '../constants/billing.constants';
import { StripeWebhookTenantNotFoundException } from '../exceptions/billing.exceptions';
import type { PausedLocationsNotice, PaymentWebhookEvent } from '../types/billing.type';

/**
 * Idempotency, then the per-event-type state machine.
 *
 * Cancellation does not imply downgrade: `customer.subscription.updated` (even with
 * `cancel_at_period_end`) leaves `plan_id` as `paid`, so the tenant keeps what they paid for.
 * Only `customer.subscription.deleted` flips it to `free` (entitlement checks read `plan_id`, not
 * `status`) and enforces the location limit.
 *
 * Webhooks are unordered, so every event that changes billing state first advances the tenant's event clock to its own
 * Stripe `created` time (`advanceEventClock`); one older than the newest already applied is stale and is acknowledged
 * without writing, so a late `past_due` or `active` cannot overwrite newer state. A completed Checkout whose payment has
 * not settled (`paymentSettled: false`) is acknowledged without upgrading; the later `async_payment_succeeded` does.
 *
 * An unresolvable customer throws so Stripe retries a transient miss (race with an uncommitted
 * Checkout, replication lag); past `UNKNOWN_CUSTOMER_RETRY_GRACE_MS` it is acknowledged and logged,
 * since failing for days risks Stripe disabling the endpoint. The one silent no-op is a stale,
 * superseded `.deleted`, which retrying would never change.
 *
 * Handlers return their tenantId so `handleEvent` stamps `stripe_last_verified_at` once, keeping
 * the reconciliation sweep off tenants a webhook just confirmed.
 *
 * One transaction per delivery covers the ledger insert and every handler write: if the ledger
 * row committed first, a failure partway through a handler would leave the event marked processed
 * and Stripe's retry would skip it forever.
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

    // Owner emails for locations a downgrade paused, sent once the transaction has committed.
    const pausedNotices: PausedLocationsNotice[] = [];

    try {
      await this.dbService.db.transaction(async tx => {
        // ON CONFLICT DO NOTHING: no row back means a duplicate delivery, which must be skipped.
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

        const tenantId = await this.dispatchEvent(tx, event, pausedNotices);
        if (tenantId !== null) {
          await this.tenantSubscriptionsDbService.touchStripeVerifiedAt(tenantId, tx);
        }
      });
    } catch (error) {
      // The transaction (ledger row included) is already rolled back, so swallowing only stops Stripe retrying.
      if (error instanceof StripeWebhookTenantNotFoundException && this.isPastRetryGrace(event)) {
        this.logger.error(
          `Dropping Stripe event ${event.id} (${rawType}) for unknown customer ${customerId ?? 'n/a'} — ` +
            `still unresolved after ${UNKNOWN_CUSTOMER_RETRY_GRACE_MS / 60000} min of retries, so this is ` +
            `not a transient miss.`
        );
        return;
      }
      throw error;
    }

    for (const notice of pausedNotices) {
      await this.billingEntitlementsService.notifyOwnersOfPausedLocations(notice);
    }
  }

  private isPastRetryGrace(event: PaymentWebhookEvent): boolean {
    return (
      event.createdAt !== undefined &&
      Date.now() - new Date(event.createdAt).getTime() > UNKNOWN_CUSTOMER_RETRY_GRACE_MS
    );
  }

  /** Returns the resolved tenant id, or `null` for an event touching no tenant (unhandled, stale). */
  private async dispatchEvent(
    tx: DrizzleTransaction,
    event: PaymentWebhookEvent,
    pausedNotices: PausedLocationsNotice[]
  ): Promise<string | null> {
    switch (event.type) {
      case 'checkout.session.completed':
        return this.handleCheckoutCompleted(tx, event);
      case 'customer.subscription.updated':
        return this.handleSubscriptionUpdated(tx, event);
      case 'customer.subscription.deleted':
        return this.handleSubscriptionDeleted(tx, event, pausedNotices);
      case 'invoice.payment_failed':
        return this.syncStatusByCustomerId(tx, event, SubscriptionStatus.PAST_DUE);
      case 'invoice.payment_succeeded':
        return this.handleInvoicePaymentSucceeded(tx, event);
      case 'unhandled':
        this.logger.debug(`Ignoring unhandled Stripe event type ${event.rawType}`);
        return null;
    }
  }

  /**
   * Whether `event` is the newest one seen for the tenant (and so may write). Events carry no `createdAt` only in tests
   * and for hand-built events, which are treated as current.
   */
  private async isCurrent(
    tx: DrizzleTransaction,
    tenantId: string,
    event: PaymentWebhookEvent
  ): Promise<boolean> {
    if (event.createdAt === undefined) {
      return true;
    }
    const current = await this.tenantSubscriptionsDbService.advanceEventClock(
      tenantId,
      event.createdAt,
      tx
    );
    if (!current) {
      this.logger.warn(
        `Ignoring stale Stripe event ${event.id} (${event.type}) for tenant ${tenantId}: ` +
          `a newer event (created after ${event.createdAt}) was already applied.`
      );
    }
    return current;
  }

  private async handleCheckoutCompleted(
    tx: DrizzleTransaction,
    event: Extract<PaymentWebhookEvent, { type: 'checkout.session.completed' }>
  ): Promise<string | null> {
    const subscription = await this.requireSubscriptionByCustomerId(tx, event.customerId);

    if (!event.paymentSettled) {
      this.logger.log(
        `Checkout for tenant ${subscription.tenantId} completed but its payment is still settling; ` +
          `staying on the current plan until the payment succeeds.`
      );
      return null;
    }
    if (!(await this.isCurrent(tx, subscription.tenantId, event))) {
      return null;
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

    // Paid has no location cap.
    await this.connectionsDbService.clearBillingPauseForTenant(subscription.tenantId, tx);

    return subscription.tenantId;
  }

  private async handleSubscriptionUpdated(
    tx: DrizzleTransaction,
    event: Extract<PaymentWebhookEvent, { type: 'customer.subscription.updated' }>
  ): Promise<string | null> {
    const subscription = await this.resolveSubscription(tx, event.customerId, event.subscriptionId);
    if (!subscription || !(await this.isCurrent(tx, subscription.tenantId, event))) {
      return null;
    }

    // `plan_id` is deliberately untouched here: a canceled-but-paid tenant stays paid.
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

    return subscription.tenantId;
  }

  private async handleSubscriptionDeleted(
    tx: DrizzleTransaction,
    event: Extract<PaymentWebhookEvent, { type: 'customer.subscription.deleted' }>,
    pausedNotices: PausedLocationsNotice[]
  ): Promise<string | null> {
    const subscription = await this.resolveSubscription(tx, event.customerId, event.subscriptionId);
    if (!subscription || !(await this.isCurrent(tx, subscription.tenantId, event))) {
      return null;
    }

    await this.tenantSubscriptionsDbService.setToFreeFromSubscriptionDeleted(
      subscription.tenantId,
      tx
    );
    const notice = await this.billingEntitlementsService.enforceLocationLimitOnDowngrade(
      subscription.tenantId,
      tx
    );
    if (notice) {
      pausedNotices.push(notice);
    }

    return subscription.tenantId;
  }

  /** Also records a `billing_receipts` row (idempotent on `stripe_invoice_id`) for the PDF receipt. */
  private async handleInvoicePaymentSucceeded(
    tx: DrizzleTransaction,
    event: Extract<PaymentWebhookEvent, { type: 'invoice.payment_succeeded' }>
  ): Promise<string> {
    const subscription = await this.requireSubscriptionByCustomerId(tx, event.customerId);

    // A late success must not turn a newer `past_due` back to active, but the receipt is a record of a payment that
    // happened, so it is written either way (it is idempotent on the invoice id).
    if (await this.isCurrent(tx, subscription.tenantId, event)) {
      await this.tenantSubscriptionsDbService.updateStatus(
        subscription.tenantId,
        SubscriptionStatus.ACTIVE,
        tx
      );
    }

    const receipt = await this.billingReceiptsDbService.recordIfNew(
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

    // Refund due: the charge succeeded after the owner asked to be erased (invoice already
    // finalized). Only on first delivery, so a replay can't log it twice.
    if (receipt.inserted && receipt.paidAfterErasureRequest) {
      this.logger.error(
        `Refund due: invoice ${event.invoiceNumber ?? event.invoiceId} (${event.amountPaid} ${event.currency}) ` +
          `was paid by tenant ${subscription.tenantId} after it requested erasure`
      );
    }

    return subscription.tenantId;
  }

  private async syncStatusByCustomerId(
    tx: DrizzleTransaction,
    event: Extract<PaymentWebhookEvent, { type: 'invoice.payment_failed' }>,
    status: SubscriptionStatus
  ): Promise<string | null> {
    const subscription = await this.requireSubscriptionByCustomerId(tx, event.customerId);
    if (!(await this.isCurrent(tx, subscription.tenantId, event))) {
      return null;
    }
    await this.tenantSubscriptionsDbService.updateStatus(subscription.tenantId, status, tx);
    return subscription.tenantId;
  }

  /**
   * Prefers the subscription id, falling back to the customer id for events arriving before
   * `checkout.session.completed`. Webhooks are unordered, so a fallback row already pointing at a
   * different non-null subscription id means the event is stale (superseded); it is skipped rather
   * than wiping the tenant's current subscription back to Free.
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

  /** Throws on a miss: every customer id was written by this app, so a miss is a transient race or a data problem, both worth a Stripe retry. */
  private async requireSubscriptionByCustomerId(
    tx: DrizzleTransaction,
    customerId: string
  ): Promise<TenantSubscriptionRow> {
    const subscription = await this.tenantSubscriptionsDbService.findByStripeCustomerId(
      customerId,
      tx
    );
    if (!subscription) {
      this.logger.warn(
        `No tenant_subscriptions row found for Stripe customer ${customerId} — rolling back so ` +
          `Stripe retries this delivery instead of it being marked processed forever.`
      );
      throw new StripeWebhookTenantNotFoundException();
    }
    return subscription;
  }
}
