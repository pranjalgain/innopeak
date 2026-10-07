import { SubscriptionCancellationSource } from '@common/enums/subscription-cancellation-source.enum';
import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import type { DBService, DrizzleTransaction } from '@db/db.service';
import type { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import type { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';

import { BillingReconciliationService } from './billing-reconciliation.service';

import { CheckoutSessionTenantMismatchException } from '../exceptions/billing.exceptions';
import type { PaymentProvider } from '../providers/payment.provider';
import type { CheckoutSessionSnapshot, SubscriptionSnapshot } from '../types/billing.type';

const snapshot: SubscriptionSnapshot = {
  stripeSubscriptionId: 'sub_1',
  status: SubscriptionStatus.ACTIVE,
  currentPeriodStart: '2026-08-01T00:00:00.000Z',
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
};

/** Opaque stand-in for the real Drizzle transaction handle the service threads through its writes. */
const fakeTx = { __fakeTx: true } as unknown as DrizzleTransaction;

describe('BillingReconciliationService', () => {
  let target: BillingReconciliationService;
  let paymentProvider: jest.Mocked<
    Pick<
      PaymentProvider,
      | 'cancelSubscription'
      | 'deleteCustomer'
      | 'resumeSubscription'
      | 'retrieveActiveSubscriptionForCustomer'
      | 'retrieveCheckoutSession'
      | 'voidOpenInvoices'
    > & { type: 'dummy' | 'stripe' }
  >;
  let tenantSubscriptionsDbService: jest.Mocked<
    Pick<
      TenantSubscriptionsDbService,
      | 'clearCancellationScheduled'
      | 'findByTenantId'
      | 'markCancellationScheduled'
      | 'setToFreeFromSubscriptionDeleted'
      | 'setToPaidFromCheckout'
      | 'touchStripeVerifiedAt'
    >
  >;
  let connectionsDbService: jest.Mocked<Pick<ConnectionsDbService, 'clearBillingPauseForTenant'>>;

  beforeEach(() => {
    paymentProvider = {
      retrieveCheckoutSession: jest.fn(),
      retrieveActiveSubscriptionForCustomer: jest.fn(),
      cancelSubscription: jest.fn().mockResolvedValue(undefined),
      deleteCustomer: jest.fn().mockResolvedValue(undefined),
      resumeSubscription: jest.fn().mockResolvedValue(undefined),
      voidOpenInvoices: jest.fn().mockResolvedValue(0),
      type: 'stripe',
    };
    tenantSubscriptionsDbService = {
      setToPaidFromCheckout: jest.fn().mockResolvedValue(null),
      touchStripeVerifiedAt: jest.fn().mockResolvedValue(undefined),
      findByTenantId: jest.fn(),
      markCancellationScheduled: jest.fn().mockResolvedValue(null),
      clearCancellationScheduled: jest.fn().mockResolvedValue(null),
      setToFreeFromSubscriptionDeleted: jest.fn().mockResolvedValue(null),
    };
    connectionsDbService = { clearBillingPauseForTenant: jest.fn().mockResolvedValue(undefined) };

    const dbService = {
      db: {
        transaction: jest.fn((fn: (tx: DrizzleTransaction) => Promise<unknown>) => fn(fakeTx)),
      },
    };

    target = new BillingReconciliationService(
      dbService as unknown as DBService,
      paymentProvider as unknown as PaymentProvider,
      tenantSubscriptionsDbService as unknown as TenantSubscriptionsDbService,
      connectionsDbService as unknown as ConnectionsDbService
    );
  });

  describe('reconcileFromCheckoutSession', () => {
    it('throws CheckoutSessionTenantMismatchException when the session belongs to a different tenant', async () => {
      const session: CheckoutSessionSnapshot = { tenantId: 'someone-else', subscription: snapshot };
      paymentProvider.retrieveCheckoutSession.mockResolvedValue(session);

      await expect(
        target.reconcileFromCheckoutSession({
          tenantId: 'tenant-1',
          checkoutSessionId: 'cs_test_123',
        })
      ).rejects.toBeInstanceOf(CheckoutSessionTenantMismatchException);

      expect(tenantSubscriptionsDbService.setToPaidFromCheckout).not.toHaveBeenCalled();
      expect(tenantSubscriptionsDbService.touchStripeVerifiedAt).not.toHaveBeenCalled();
    });

    it('applies the subscription and clears the billing pause when the session has one', async () => {
      const session: CheckoutSessionSnapshot = { tenantId: 'tenant-1', subscription: snapshot };
      paymentProvider.retrieveCheckoutSession.mockResolvedValue(session);

      await target.reconcileFromCheckoutSession({
        tenantId: 'tenant-1',
        checkoutSessionId: 'cs_test_123',
      });

      expect(tenantSubscriptionsDbService.setToPaidFromCheckout).toHaveBeenCalledWith(
        'tenant-1',
        snapshot,
        fakeTx
      );
      expect(connectionsDbService.clearBillingPauseForTenant).toHaveBeenCalledWith(
        'tenant-1',
        fakeTx
      );
      expect(tenantSubscriptionsDbService.touchStripeVerifiedAt).toHaveBeenCalledWith(
        'tenant-1',
        fakeTx
      );
    });

    it('only stamps stripe_last_verified_at when the session has no subscription yet', async () => {
      const session: CheckoutSessionSnapshot = { tenantId: 'tenant-1', subscription: null };
      paymentProvider.retrieveCheckoutSession.mockResolvedValue(session);

      await target.reconcileFromCheckoutSession({
        tenantId: 'tenant-1',
        checkoutSessionId: 'cs_test_123',
      });

      expect(tenantSubscriptionsDbService.setToPaidFromCheckout).not.toHaveBeenCalled();
      expect(connectionsDbService.clearBillingPauseForTenant).not.toHaveBeenCalled();
      expect(tenantSubscriptionsDbService.touchStripeVerifiedAt).toHaveBeenCalledWith(
        'tenant-1',
        fakeTx
      );
    });
  });

  describe('subscription status guard', () => {
    it.each([SubscriptionStatus.CANCELED, SubscriptionStatus.INCOMPLETE])(
      'does not mark the tenant paid for a %s subscription — only stamps the verification',
      async status => {
        paymentProvider.retrieveCheckoutSession.mockResolvedValue({
          tenantId: 'tenant-1',
          subscription: { ...snapshot, status },
        });

        await target.reconcileFromCheckoutSession({
          tenantId: 'tenant-1',
          checkoutSessionId: 'cs_test_replayed',
        });

        expect(tenantSubscriptionsDbService.setToPaidFromCheckout).not.toHaveBeenCalled();
        expect(connectionsDbService.clearBillingPauseForTenant).not.toHaveBeenCalled();
        expect(tenantSubscriptionsDbService.touchStripeVerifiedAt).toHaveBeenCalledWith(
          'tenant-1',
          fakeTx
        );
      }
    );

    it('still applies a past_due subscription — Stripe is retrying payment, the tenant is not cancelled', async () => {
      paymentProvider.retrieveCheckoutSession.mockResolvedValue({
        tenantId: 'tenant-1',
        subscription: { ...snapshot, status: SubscriptionStatus.PAST_DUE },
      });

      await target.reconcileFromCheckoutSession({
        tenantId: 'tenant-1',
        checkoutSessionId: 'cs_test_123',
      });

      expect(tenantSubscriptionsDbService.setToPaidFromCheckout).toHaveBeenCalledTimes(1);
    });

    it('does not stamp verification when the transaction fails partway (nothing half-applied)', async () => {
      paymentProvider.retrieveCheckoutSession.mockResolvedValue({
        tenantId: 'tenant-1',
        subscription: snapshot,
      });
      connectionsDbService.clearBillingPauseForTenant.mockRejectedValue(new Error('db blip'));

      await expect(
        target.reconcileFromCheckoutSession({ tenantId: 'tenant-1', checkoutSessionId: 'cs' })
      ).rejects.toThrow('db blip');

      expect(tenantSubscriptionsDbService.touchStripeVerifiedAt).not.toHaveBeenCalled();
    });
  });

  describe('reconcileTenantSubscription', () => {
    it('applies an active subscription found directly on the customer', async () => {
      paymentProvider.retrieveActiveSubscriptionForCustomer.mockResolvedValue(snapshot);

      await target.reconcileTenantSubscription({ tenantId: 'tenant-1', stripeCustomerId: 'cus_1' });

      expect(paymentProvider.retrieveActiveSubscriptionForCustomer).toHaveBeenCalledWith('cus_1');
      expect(tenantSubscriptionsDbService.setToPaidFromCheckout).toHaveBeenCalledWith(
        'tenant-1',
        snapshot,
        fakeTx
      );
      expect(connectionsDbService.clearBillingPauseForTenant).toHaveBeenCalledWith(
        'tenant-1',
        fakeTx
      );
      expect(tenantSubscriptionsDbService.touchStripeVerifiedAt).toHaveBeenCalledWith(
        'tenant-1',
        fakeTx
      );
    });

    it('only stamps stripe_last_verified_at when Stripe reports no active subscription — a genuinely still-free tenant', async () => {
      paymentProvider.retrieveActiveSubscriptionForCustomer.mockResolvedValue(null);

      await target.reconcileTenantSubscription({ tenantId: 'tenant-1', stripeCustomerId: 'cus_1' });

      expect(tenantSubscriptionsDbService.setToPaidFromCheckout).not.toHaveBeenCalled();
      expect(connectionsDbService.clearBillingPauseForTenant).not.toHaveBeenCalled();
      expect(tenantSubscriptionsDbService.touchStripeVerifiedAt).toHaveBeenCalledWith(
        'tenant-1',
        fakeTx
      );
    });
  });

  describe('scheduleCancellationForErasure', () => {
    const row = (overrides: Record<string, unknown>) =>
      ({
        stripeSubscriptionId: 'sub_1',
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: false,
        cancellationSource: null,
        ...overrides,
      }) as Awaited<ReturnType<TenantSubscriptionsDbService['findByTenantId']>>;

    it('sets an active subscription to cancel at period end and records erasure as the source', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(row({}));

      await target.scheduleCancellationForErasure('tenant-1');

      expect(tenantSubscriptionsDbService.markCancellationScheduled).toHaveBeenCalledWith(
        'tenant-1',
        SubscriptionCancellationSource.ERASURE
      );
      expect(paymentProvider.cancelSubscription).toHaveBeenCalledWith('sub_1', true);
      expect(
        tenantSubscriptionsDbService.markCancellationScheduled.mock.invocationCallOrder[0]
      ).toBeLessThan(paymentProvider.cancelSubscription.mock.invocationCallOrder[0] ?? 0);
    });

    it('re-asserts the source once Stripe has accepted the change, so a stale webhook cannot lose it', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(row({}));

      await target.scheduleCancellationForErasure('tenant-1');

      const calls = tenantSubscriptionsDbService.markCancellationScheduled.mock.invocationCallOrder;
      expect(calls).toHaveLength(2);
      expect(calls[1]).toBeGreaterThan(
        paymentProvider.cancelSubscription.mock.invocationCallOrder[0] ?? 0
      );
    });

    it('reverts the recorded source when Stripe refuses, and rethrows', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(row({}));
      paymentProvider.cancelSubscription.mockRejectedValue(new Error('connection error'));

      await expect(target.scheduleCancellationForErasure('tenant-1')).rejects.toThrow(
        'connection error'
      );

      expect(tenantSubscriptionsDbService.clearCancellationScheduled).toHaveBeenCalledWith(
        'tenant-1'
      );
    });

    it('treats a subscription Stripe no longer has as done', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(row({}));
      paymentProvider.cancelSubscription.mockRejectedValue(
        Object.assign(new Error('No such subscription'), { code: 'resource_missing' })
      );

      await expect(target.scheduleCancellationForErasure('tenant-1')).resolves.toBeUndefined();
    });

    it('cancels a past_due subscription immediately and voids its open invoices', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(
        row({ status: SubscriptionStatus.PAST_DUE })
      );

      await target.scheduleCancellationForErasure('tenant-1');

      expect(paymentProvider.cancelSubscription).toHaveBeenCalledWith('sub_1', false);
      expect(paymentProvider.voidOpenInvoices).toHaveBeenCalledWith('sub_1');
      expect(tenantSubscriptionsDbService.markCancellationScheduled).not.toHaveBeenCalled();
    });

    it('applies the Free state itself on the Dummy provider, which delivers no webhook', async () => {
      paymentProvider.type = 'dummy';
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(
        row({ status: SubscriptionStatus.PAST_DUE })
      );

      await target.scheduleCancellationForErasure('tenant-1');

      expect(tenantSubscriptionsDbService.setToFreeFromSubscriptionDeleted).toHaveBeenCalledWith(
        'tenant-1'
      );
    });

    it('leaves a free tenant, a cancelled subscription and one the owner already ended alone', async () => {
      for (const value of [
        row({ stripeSubscriptionId: null, status: null }),
        row({ status: SubscriptionStatus.CANCELED }),
        row({ cancelAtPeriodEnd: true, cancellationSource: SubscriptionCancellationSource.OWNER }),
      ]) {
        tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(value);
        await target.scheduleCancellationForErasure('tenant-1');
      }

      expect(paymentProvider.cancelSubscription).not.toHaveBeenCalled();
      expect(tenantSubscriptionsDbService.markCancellationScheduled).not.toHaveBeenCalled();
    });
  });

  describe('resumeAfterErasureCancelled', () => {
    const inTheFuture = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const ending = (overrides: Record<string, unknown> = {}) =>
      ({
        stripeSubscriptionId: 'sub_1',
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: true,
        cancellationSource: SubscriptionCancellationSource.ERASURE,
        currentPeriodEnd: inTheFuture,
        ...overrides,
      }) as Awaited<ReturnType<TenantSubscriptionsDbService['findByTenantId']>>;

    it('resumes a subscription that erasure set to end, and clears the marker', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(ending());

      await target.resumeAfterErasureCancelled('tenant-1');

      expect(paymentProvider.resumeSubscription).toHaveBeenCalledWith('sub_1');
      expect(tenantSubscriptionsDbService.clearCancellationScheduled).toHaveBeenCalledWith(
        'tenant-1'
      );
    });

    /** The whole point of the column: resuming this would charge the owner against their wishes. */
    it.each([
      ['the owner cancelled it', { cancellationSource: SubscriptionCancellationSource.OWNER }],
      ['nobody recorded who cancelled it', { cancellationSource: null }],
      ['it is not ending at all', { cancelAtPeriodEnd: false, cancellationSource: null }],
      ['the paid period has already run out', { currentPeriodEnd: '2020-01-01T00:00:00.000Z' }],
      ['it is no longer active', { status: SubscriptionStatus.CANCELED }],
      ['it is a free tenant', { stripeSubscriptionId: null }],
    ])('does not resume when %s', async (_label, overrides) => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(ending(overrides));

      await target.resumeAfterErasureCancelled('tenant-1');

      expect(paymentProvider.resumeSubscription).not.toHaveBeenCalled();
      expect(tenantSubscriptionsDbService.clearCancellationScheduled).not.toHaveBeenCalled();
    });

    it('rethrows a Stripe failure, leaving the marker so nothing is mis-attributed', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(ending());
      paymentProvider.resumeSubscription.mockRejectedValue(new Error('connection error'));

      await expect(target.resumeAfterErasureCancelled('tenant-1')).rejects.toThrow(
        'connection error'
      );

      expect(tenantSubscriptionsDbService.clearCancellationScheduled).not.toHaveBeenCalled();
    });
  });

  describe('releaseBillingForErasure', () => {
    it("deletes the tenant's Stripe customer, free or paid", async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
        stripeCustomerId: 'cus_1',
      } as Awaited<ReturnType<TenantSubscriptionsDbService['findByTenantId']>>);

      await target.releaseBillingForErasure('tenant-1');

      expect(paymentProvider.deleteCustomer).toHaveBeenCalledWith('cus_1');
    });

    it('does nothing for a tenant that never had a Stripe customer', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
        stripeCustomerId: null,
      } as Awaited<ReturnType<TenantSubscriptionsDbService['findByTenantId']>>);

      await target.releaseBillingForErasure('tenant-1');

      expect(paymentProvider.deleteCustomer).not.toHaveBeenCalled();
    });

    it('rethrows a Stripe failure so the purge skips the tenant and retries', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
        stripeCustomerId: 'cus_1',
      } as Awaited<ReturnType<TenantSubscriptionsDbService['findByTenantId']>>);
      paymentProvider.deleteCustomer.mockRejectedValue(new Error('connection error'));

      await expect(target.releaseBillingForErasure('tenant-1')).rejects.toThrow('connection error');
    });
  });
});
