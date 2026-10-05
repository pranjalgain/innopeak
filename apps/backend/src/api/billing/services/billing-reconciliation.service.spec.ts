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
    Pick<PaymentProvider, 'retrieveActiveSubscriptionForCustomer' | 'retrieveCheckoutSession'>
  >;
  let tenantSubscriptionsDbService: jest.Mocked<
    Pick<TenantSubscriptionsDbService, 'setToPaidFromCheckout' | 'touchStripeVerifiedAt'>
  >;
  let connectionsDbService: jest.Mocked<Pick<ConnectionsDbService, 'clearBillingPauseForTenant'>>;

  beforeEach(() => {
    paymentProvider = {
      retrieveCheckoutSession: jest.fn(),
      retrieveActiveSubscriptionForCustomer: jest.fn(),
    };
    tenantSubscriptionsDbService = {
      setToPaidFromCheckout: jest.fn().mockResolvedValue(null),
      touchStripeVerifiedAt: jest.fn().mockResolvedValue(undefined),
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
});
