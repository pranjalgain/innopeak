import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import type { DBService, DrizzleTransaction } from '@db/db.service';
import type { BillingReceiptsDbService } from '@db/repositories/billing/billing-receipts.db-service';
import type { StripeWebhookEventsDbService } from '@db/repositories/billing/stripe-webhook-events.db-service';
import type { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import type { TenantSubscriptionRow } from '@db/repositories/billing/tenant-subscriptions.repository';
import type { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';

import type { BillingEntitlementsService } from './billing-entitlements.service';
import { BillingWebhooksService } from './billing-webhooks.service';

import type { PaymentWebhookEvent } from '../types/billing.type';

/** Opaque stand-in for the real Drizzle transaction handle — `handleEvent` opens exactly one via
 *  `dbService.db.transaction(fn)` and threads it through every DbService call, so every assertion
 *  below expects it as the trailing argument. */
const fakeTx = { __fakeTx: true } as unknown as DrizzleTransaction;

const subscriptionRow: TenantSubscriptionRow = {
  id: 'sub-row-1',
  tenantId: 'tenant-1',
  planId: 'plan-paid',
  stripeCustomerId: 'cus_1',
  stripeSubscriptionId: 'sub_1',
  status: SubscriptionStatus.ACTIVE,
  currentPeriodStart: '2026-08-01T00:00:00.000Z',
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
};

describe('BillingWebhooksService', () => {
  let target: BillingWebhooksService;
  let dbService: { db: { transaction: jest.Mock } };
  let stripeWebhookEventsDbService: jest.Mocked<Pick<StripeWebhookEventsDbService, 'recordIfNew'>>;
  let tenantSubscriptionsDbService: jest.Mocked<
    Pick<
      TenantSubscriptionsDbService,
      | 'findByStripeCustomerId'
      | 'findByStripeSubscriptionId'
      | 'setToFreeFromSubscriptionDeleted'
      | 'setToPaidFromCheckout'
      | 'syncSubscriptionFields'
      | 'updateStatus'
    >
  >;
  let connectionsDbService: jest.Mocked<Pick<ConnectionsDbService, 'clearBillingPauseForTenant'>>;
  let billingEntitlementsService: jest.Mocked<
    Pick<BillingEntitlementsService, 'enforceLocationLimitOnDowngrade'>
  >;
  let billingReceiptsDbService: jest.Mocked<Pick<BillingReceiptsDbService, 'recordIfNew'>>;

  beforeEach(() => {
    dbService = {
      db: { transaction: jest.fn((fn: (tx: DrizzleTransaction) => unknown) => fn(fakeTx)) },
    };
    stripeWebhookEventsDbService = { recordIfNew: jest.fn().mockResolvedValue(true) };
    tenantSubscriptionsDbService = {
      findByStripeCustomerId: jest.fn().mockResolvedValue(subscriptionRow),
      findByStripeSubscriptionId: jest.fn().mockResolvedValue(null),
      setToPaidFromCheckout: jest.fn(),
      syncSubscriptionFields: jest.fn(),
      setToFreeFromSubscriptionDeleted: jest.fn(),
      updateStatus: jest.fn(),
    };
    connectionsDbService = { clearBillingPauseForTenant: jest.fn() };
    billingEntitlementsService = { enforceLocationLimitOnDowngrade: jest.fn() };
    billingReceiptsDbService = { recordIfNew: jest.fn() };

    target = new BillingWebhooksService(
      dbService as unknown as DBService,
      stripeWebhookEventsDbService as unknown as StripeWebhookEventsDbService,
      tenantSubscriptionsDbService as unknown as TenantSubscriptionsDbService,
      connectionsDbService as unknown as ConnectionsDbService,
      billingEntitlementsService as unknown as BillingEntitlementsService,
      billingReceiptsDbService as unknown as BillingReceiptsDbService
    );
  });

  describe('idempotency', () => {
    it('records the event id first and skips processing on a duplicate', async () => {
      stripeWebhookEventsDbService.recordIfNew.mockResolvedValue(false);

      await target.handleEvent({
        id: 'evt_1',
        type: 'checkout.session.completed',
        customerId: 'cus_1',
        subscriptionId: 'sub_1',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: null,
        currentPeriodEnd: null,
      });

      expect(stripeWebhookEventsDbService.recordIfNew).toHaveBeenCalledWith(
        'evt_1',
        'checkout.session.completed',
        fakeTx
      );
      expect(tenantSubscriptionsDbService.setToPaidFromCheckout).not.toHaveBeenCalled();
    });
  });

  describe('checkout.session.completed', () => {
    const event: PaymentWebhookEvent = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: '2026-08-01T00:00:00.000Z',
      currentPeriodEnd: '2026-09-01T00:00:00.000Z',
    };

    it('flips plan_id to paid and clears billing_paused_at on every location', async () => {
      await target.handleEvent(event);

      expect(tenantSubscriptionsDbService.setToPaidFromCheckout).toHaveBeenCalledWith(
        'tenant-1',
        {
          stripeSubscriptionId: 'sub_1',
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: '2026-08-01T00:00:00.000Z',
          currentPeriodEnd: '2026-09-01T00:00:00.000Z',
          cancelAtPeriodEnd: false,
        },
        fakeTx
      );
      expect(connectionsDbService.clearBillingPauseForTenant).toHaveBeenCalledWith(
        'tenant-1',
        fakeTx
      );
    });

    it('does nothing (but does not throw) when no tenant_subscriptions row matches the Stripe customer', async () => {
      tenantSubscriptionsDbService.findByStripeCustomerId.mockResolvedValue(null);

      await expect(target.handleEvent(event)).resolves.toBeUndefined();

      expect(tenantSubscriptionsDbService.setToPaidFromCheckout).not.toHaveBeenCalled();
      expect(connectionsDbService.clearBillingPauseForTenant).not.toHaveBeenCalled();
    });
  });

  describe('customer.subscription.updated', () => {
    /**
     * The trickiest correctness requirement in the plan: a canceled-but-still-in-grace-period
     * tenant must keep reading as `paid` with unlimited entitlements. `plan_id` must never be
     * touched by this branch.
     */
    it('syncs status/period/cancel_at_period_end but leaves plan_id untouched when cancel_at_period_end is true', async () => {
      tenantSubscriptionsDbService.findByStripeSubscriptionId.mockResolvedValue(subscriptionRow);

      await target.handleEvent({
        id: 'evt_2',
        type: 'customer.subscription.updated',
        customerId: 'cus_1',
        subscriptionId: 'sub_1',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: '2026-08-01T00:00:00.000Z',
        currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        cancelAtPeriodEnd: true,
      });

      expect(tenantSubscriptionsDbService.syncSubscriptionFields).toHaveBeenCalledWith(
        'tenant-1',
        {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: '2026-08-01T00:00:00.000Z',
          currentPeriodEnd: '2026-09-01T00:00:00.000Z',
          cancelAtPeriodEnd: true,
        },
        fakeTx
      );
      expect(tenantSubscriptionsDbService.setToPaidFromCheckout).not.toHaveBeenCalled();
      expect(tenantSubscriptionsDbService.setToFreeFromSubscriptionDeleted).not.toHaveBeenCalled();
    });

    it('resolves the tenant by subscription id first, falling back to customer id', async () => {
      tenantSubscriptionsDbService.findByStripeSubscriptionId.mockResolvedValue(null);

      await target.handleEvent({
        id: 'evt_3',
        type: 'customer.subscription.updated',
        customerId: 'cus_1',
        subscriptionId: 'sub_1',
        status: SubscriptionStatus.PAST_DUE,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      });

      expect(tenantSubscriptionsDbService.findByStripeSubscriptionId).toHaveBeenCalledWith(
        'sub_1',
        fakeTx
      );
      expect(tenantSubscriptionsDbService.findByStripeCustomerId).toHaveBeenCalledWith(
        'cus_1',
        fakeTx
      );
      expect(tenantSubscriptionsDbService.syncSubscriptionFields).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ status: SubscriptionStatus.PAST_DUE }),
        fakeTx
      );
    });
  });

  describe('customer.subscription.deleted', () => {
    it('flips plan_id back to free and enforces the new plan location limit', async () => {
      tenantSubscriptionsDbService.findByStripeSubscriptionId.mockResolvedValue(subscriptionRow);

      await target.handleEvent({
        id: 'evt_4',
        type: 'customer.subscription.deleted',
        customerId: 'cus_1',
        subscriptionId: 'sub_1',
      });

      expect(tenantSubscriptionsDbService.setToFreeFromSubscriptionDeleted).toHaveBeenCalledWith(
        'tenant-1',
        fakeTx
      );
      expect(billingEntitlementsService.enforceLocationLimitOnDowngrade).toHaveBeenCalledWith(
        'tenant-1',
        fakeTx
      );
    });

    it('does nothing when the tenant cannot be resolved', async () => {
      tenantSubscriptionsDbService.findByStripeSubscriptionId.mockResolvedValue(null);
      tenantSubscriptionsDbService.findByStripeCustomerId.mockResolvedValue(null);

      await target.handleEvent({
        id: 'evt_5',
        type: 'customer.subscription.deleted',
        customerId: 'cus_unknown',
        subscriptionId: 'sub_unknown',
      });

      expect(tenantSubscriptionsDbService.setToFreeFromSubscriptionDeleted).not.toHaveBeenCalled();
      expect(billingEntitlementsService.enforceLocationLimitOnDowngrade).not.toHaveBeenCalled();
    });

    /**
     * The critical race this guards against: Stripe doesn't order webhook delivery, so a
     * `.deleted` for a subscription the tenant has already replaced (canceled, then resubscribed
     * before this stale event arrived) must not resolve by customer id and wipe out the tenant's
     * current, active subscription.
     */
    it('ignores a stale .deleted event for a subscription the tenant has since replaced', async () => {
      tenantSubscriptionsDbService.findByStripeSubscriptionId.mockResolvedValue(null);
      tenantSubscriptionsDbService.findByStripeCustomerId.mockResolvedValue({
        ...subscriptionRow,
        stripeSubscriptionId: 'sub_new',
      });

      await target.handleEvent({
        id: 'evt_stale',
        type: 'customer.subscription.deleted',
        customerId: 'cus_1',
        subscriptionId: 'sub_old',
      });

      expect(tenantSubscriptionsDbService.setToFreeFromSubscriptionDeleted).not.toHaveBeenCalled();
      expect(billingEntitlementsService.enforceLocationLimitOnDowngrade).not.toHaveBeenCalled();
    });

    it('still applies a .deleted event whose subscription id matches the customer-id fallback row', async () => {
      tenantSubscriptionsDbService.findByStripeSubscriptionId.mockResolvedValue(null);
      tenantSubscriptionsDbService.findByStripeCustomerId.mockResolvedValue(subscriptionRow);

      await target.handleEvent({
        id: 'evt_matching',
        type: 'customer.subscription.deleted',
        customerId: 'cus_1',
        subscriptionId: subscriptionRow.stripeSubscriptionId as string,
      });

      expect(tenantSubscriptionsDbService.setToFreeFromSubscriptionDeleted).toHaveBeenCalledWith(
        'tenant-1',
        fakeTx
      );
    });
  });

  describe('invoice events', () => {
    it('sets status to past_due on invoice.payment_failed', async () => {
      await target.handleEvent({
        id: 'evt_6',
        type: 'invoice.payment_failed',
        customerId: 'cus_1',
      });

      expect(tenantSubscriptionsDbService.updateStatus).toHaveBeenCalledWith(
        'tenant-1',
        SubscriptionStatus.PAST_DUE,
        fakeTx
      );
    });

    it('sets status to active and records a receipt on invoice.payment_succeeded', async () => {
      await target.handleEvent({
        id: 'evt_7',
        type: 'invoice.payment_succeeded',
        customerId: 'cus_1',
        invoiceId: 'in_1',
        subscriptionId: 'sub_1',
        amountPaid: 4900,
        currency: 'usd',
        invoiceNumber: 'INV-0001',
        paidAt: '2026-09-01T00:00:00.000Z',
      });

      expect(tenantSubscriptionsDbService.updateStatus).toHaveBeenCalledWith(
        'tenant-1',
        SubscriptionStatus.ACTIVE,
        fakeTx
      );
      expect(billingReceiptsDbService.recordIfNew).toHaveBeenCalledWith(
        {
          tenantId: 'tenant-1',
          stripeInvoiceId: 'in_1',
          stripeSubscriptionId: 'sub_1',
          amountPaid: 4900,
          currency: 'usd',
          invoiceNumber: 'INV-0001',
          paidAt: '2026-09-01T00:00:00.000Z',
        },
        fakeTx
      );
    });

    it('does not record a receipt when the tenant cannot be resolved', async () => {
      tenantSubscriptionsDbService.findByStripeCustomerId.mockResolvedValue(null);

      await target.handleEvent({
        id: 'evt_9',
        type: 'invoice.payment_succeeded',
        customerId: 'cus_unknown',
        invoiceId: 'in_2',
        subscriptionId: null,
        amountPaid: 4900,
        currency: 'usd',
        invoiceNumber: null,
        paidAt: '2026-09-01T00:00:00.000Z',
      });

      expect(billingReceiptsDbService.recordIfNew).not.toHaveBeenCalled();
    });
  });

  describe('unhandled', () => {
    it('records the event (idempotency) and does nothing else', async () => {
      await target.handleEvent({ id: 'evt_8', type: 'unhandled', rawType: 'charge.succeeded' });

      expect(stripeWebhookEventsDbService.recordIfNew).toHaveBeenCalledWith(
        'evt_8',
        'charge.succeeded',
        fakeTx
      );
      expect(tenantSubscriptionsDbService.updateStatus).not.toHaveBeenCalled();
      expect(tenantSubscriptionsDbService.syncSubscriptionFields).not.toHaveBeenCalled();
    });
  });
});
