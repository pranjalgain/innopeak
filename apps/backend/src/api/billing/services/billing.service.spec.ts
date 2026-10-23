import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { TenantAuthUser } from '@auth/types/auth.type';
import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { SubscriptionCancellationSource } from '@common/enums/subscription-cancellation-source.enum';
import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import type { EnvConfig } from '@config/env.config';
import type { DrizzleTransaction } from '@db/db.service';
import type { AuthDbService } from '@db/repositories/auth/auth.db-service';
import type { BillingPlansDbService } from '@db/repositories/billing/billing-plans.db-service';
import type { BillingReceiptsDbService } from '@db/repositories/billing/billing-receipts.db-service';
import type { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import type { TenantSubscriptionRow } from '@db/repositories/billing/types/billing.type';
import type { ConfigService } from '@nestjs/config';

import type { BillingEntitlementsService } from './billing-entitlements.service';
import type { BillingReconciliationService } from './billing-reconciliation.service';
import { BillingService } from './billing.service';

import {
  AlreadySubscribedException,
  BillingNotEnabledException,
  ReceiptNotFoundException,
  SubscriptionNotFoundException,
} from '../exceptions/billing.exceptions';
import type { PaymentProvider } from '../providers/payment.provider';

const fakeTx = { __fakeTx: true } as unknown as DrizzleTransaction;

const tenantUser: TenantAuthUser = {
  type: JwtTokenType.TENANT_USER,
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'owner@example.com',
  role: UserRole.OWNER,
  locale: null,
};

const baseSubscription: TenantSubscriptionRow = {
  id: 'sub-row-1',
  tenantId: 'tenant-1',
  planId: 'plan-free',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  status: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  cancellationSource: null,
  stripeLastVerifiedAt: null,
  checkoutStartedAt: null,
};

function buildConfigService(
  overrides: Partial<Record<string, string>> = {}
): ConfigService<EnvConfig> {
  const values: Record<string, string> = {
    FRONTEND_URL: 'http://localhost:3002',
    PAYMENT_FEATURE_ENABLED: 'true',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService<EnvConfig>;
}

describe('BillingService', () => {
  let target: BillingService;
  let billingPlansDbService: jest.Mocked<Pick<BillingPlansDbService, 'findByCode' | 'listAll'>>;
  let tenantSubscriptionsDbService: jest.Mocked<
    Pick<
      TenantSubscriptionsDbService,
      | 'attachStripeCustomerId'
      | 'clearCancellationScheduled'
      | 'findByTenantId'
      | 'markCancellationScheduled'
      | 'restoreCancellationState'
      | 'touchCheckoutStartedAt'
      | 'withCheckoutLock'
    >
  >;
  let billingEntitlementsService: jest.Mocked<
    Pick<BillingEntitlementsService, 'getEntitlements' | 'setActiveLocationForPlan'>
  >;
  let billingReconciliationService: jest.Mocked<
    Pick<
      BillingReconciliationService,
      'reconcileFromCheckoutSession' | 'reconcileTenantSubscription'
    >
  >;
  let billingReceiptsDbService: jest.Mocked<
    Pick<BillingReceiptsDbService, 'findByIdForTenant' | 'listByTenantId'>
  >;
  let authDbService: jest.Mocked<Pick<AuthDbService, 'findTenantStatus'>>;
  let paymentProvider: {
    createCustomer: jest.Mock;
    createCheckoutSession: jest.Mock;
    prepareNewCheckout: jest.Mock;
    cancelStaleSubscriptions: jest.Mock;
    createPortalSession: jest.Mock;
    cancelSubscription: jest.Mock;
    getPaymentMethodSummary: jest.Mock;
    getBillingProfile: jest.Mock;
    updateBillingProfile: jest.Mock;
    createSetupIntent: jest.Mock;
    setDefaultPaymentMethod: jest.Mock;
  };

  beforeEach(() => {
    billingPlansDbService = { findByCode: jest.fn(), listAll: jest.fn() };
    tenantSubscriptionsDbService = {
      findByTenantId: jest.fn(),
      markCancellationScheduled: jest.fn().mockResolvedValue(undefined),
      clearCancellationScheduled: jest.fn().mockResolvedValue(undefined),
      restoreCancellationState: jest.fn().mockResolvedValue(undefined),
      touchCheckoutStartedAt: jest.fn().mockResolvedValue(undefined),
      attachStripeCustomerId: jest.fn().mockResolvedValue(baseSubscription),
      // Fake lock: resolves the row via findByTenantId and hands it, with a fake tx, to the callback.
      withCheckoutLock: jest.fn(),
    };
    tenantSubscriptionsDbService.withCheckoutLock.mockImplementation(
      async (
        tenantId: string,
        fn: (tx: DrizzleTransaction, subscription: TenantSubscriptionRow | null) => unknown
      ) => fn(fakeTx, await tenantSubscriptionsDbService.findByTenantId(tenantId))
    );
    billingEntitlementsService = {
      setActiveLocationForPlan: jest.fn(),
      getEntitlements: jest.fn().mockResolvedValue({
        planCode: BillingPlanCode.FREE,
        maxLocations: 1,
        maxAiDraftsPerMonth: 20,
        maxTeamMembers: 1,
        customPromptsEnabled: false,
        activeLocationCount: 0,
        teamMemberCount: 1,
        aiDraftsUsedThisMonth: 0,
      }),
    };
    billingReconciliationService = {
      reconcileFromCheckoutSession: jest.fn().mockResolvedValue(undefined),
      reconcileTenantSubscription: jest.fn().mockResolvedValue(undefined),
    };
    billingReceiptsDbService = {
      listByTenantId: jest.fn().mockResolvedValue([]),
      findByIdForTenant: jest.fn().mockResolvedValue(null),
    };
    authDbService = {
      findTenantStatus: jest.fn().mockResolvedValue({ status: 'active', name: 'Acme Inc' }),
    };
    paymentProvider = {
      createCustomer: jest.fn(),
      createCheckoutSession: jest.fn(),
      prepareNewCheckout: jest
        .fn()
        .mockResolvedValue({ hasLiveSubscription: false, staleSubscriptionIds: [] }),
      cancelStaleSubscriptions: jest.fn().mockResolvedValue(undefined),
      createPortalSession: jest.fn(),
      cancelSubscription: jest.fn().mockResolvedValue(undefined),
      getPaymentMethodSummary: jest.fn().mockResolvedValue(null),
      getBillingProfile: jest.fn(),
      updateBillingProfile: jest.fn(),
      createSetupIntent: jest.fn(),
      setDefaultPaymentMethod: jest.fn().mockResolvedValue(undefined),
    };

    target = new BillingService(
      billingPlansDbService as unknown as BillingPlansDbService,
      tenantSubscriptionsDbService as unknown as TenantSubscriptionsDbService,
      billingEntitlementsService as unknown as BillingEntitlementsService,
      billingReconciliationService as unknown as BillingReconciliationService,
      billingReceiptsDbService as unknown as BillingReceiptsDbService,
      authDbService as unknown as AuthDbService,
      paymentProvider as unknown as PaymentProvider,
      buildConfigService()
    );
  });

  describe('createCheckoutSession', () => {
    it('throws BillingNotEnabledException when PAYMENT_FEATURE_ENABLED is off', async () => {
      const gatedTarget = new BillingService(
        billingPlansDbService as unknown as BillingPlansDbService,
        tenantSubscriptionsDbService as unknown as TenantSubscriptionsDbService,
        billingEntitlementsService as unknown as BillingEntitlementsService,
        billingReconciliationService as unknown as BillingReconciliationService,
        billingReceiptsDbService as unknown as BillingReceiptsDbService,
        authDbService as unknown as AuthDbService,
        paymentProvider as unknown as PaymentProvider,
        buildConfigService({ PAYMENT_FEATURE_ENABLED: 'false' })
      );

      await expect(gatedTarget.createCheckoutSession(tenantUser)).rejects.toBeInstanceOf(
        BillingNotEnabledException
      );
      expect(paymentProvider.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('starts a checkout session when PAYMENT_FEATURE_ENABLED is on', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(baseSubscription);
      billingPlansDbService.findByCode.mockResolvedValue({
        id: 'plan-paid',
        code: BillingPlanCode.PAID,
        stripeProductId: null,
        stripePriceId: 'price_paid',
        maxLocations: null,
        maxAiDraftsPerMonth: null,
        maxTeamMembers: null,
        customPromptsEnabled: true,
      });
      paymentProvider.createCustomer.mockResolvedValue({ customerId: 'cus_test_1' });
      paymentProvider.createCheckoutSession.mockResolvedValue({
        url: 'https://example.com/checkout',
      });

      const result = await target.createCheckoutSession(tenantUser);

      expect(result).toEqual({ url: 'https://example.com/checkout' });
      expect(paymentProvider.createCheckoutSession).toHaveBeenCalledTimes(1);
      expect(tenantSubscriptionsDbService.touchCheckoutStartedAt).toHaveBeenCalledWith('tenant-1');
    });

    it('reuses an existing Stripe customer id instead of minting a second one', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        stripeCustomerId: 'cus_existing',
      });
      billingPlansDbService.findByCode.mockResolvedValue({
        id: 'plan-paid',
        code: BillingPlanCode.PAID,
        stripeProductId: null,
        stripePriceId: 'price_paid',
        maxLocations: null,
        maxAiDraftsPerMonth: null,
        maxTeamMembers: null,
        customPromptsEnabled: true,
      });
      paymentProvider.createCheckoutSession.mockResolvedValue({
        url: 'https://example.com/checkout',
      });

      await target.createCheckoutSession(tenantUser);

      expect(paymentProvider.createCustomer).not.toHaveBeenCalled();
      expect(tenantSubscriptionsDbService.attachStripeCustomerId).not.toHaveBeenCalled();
      // Asked first: an older open Checkout is expired and a not-yet-recorded subscription is caught.
      expect(paymentProvider.prepareNewCheckout).toHaveBeenCalledWith('cus_existing');
      expect(paymentProvider.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cus_existing' })
      );
    });

    // Each cancel is a Stripe round trip; inside the lock they held a database connection and the tenant's advisory lock.
    it('cancels the stale subscriptions Stripe reported only after the checkout lock is released', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        stripeCustomerId: 'cus_existing',
      });
      billingPlansDbService.findByCode.mockResolvedValue({
        id: 'plan-paid',
        code: BillingPlanCode.PAID,
        stripeProductId: null,
        stripePriceId: 'price_paid',
        maxLocations: null,
        maxAiDraftsPerMonth: null,
        maxTeamMembers: null,
        customPromptsEnabled: true,
      });
      paymentProvider.prepareNewCheckout.mockResolvedValue({
        hasLiveSubscription: false,
        staleSubscriptionIds: ['sub_unpaid'],
      });
      paymentProvider.createCheckoutSession.mockResolvedValue({
        url: 'https://example.com/checkout',
      });
      let lockHeld = false;
      tenantSubscriptionsDbService.withCheckoutLock.mockImplementation(
        async (
          tenantId: string,
          fn: (tx: DrizzleTransaction, subscription: TenantSubscriptionRow | null) => unknown
        ) => {
          const subscription = await tenantSubscriptionsDbService.findByTenantId(tenantId);
          lockHeld = true;
          try {
            return await fn(fakeTx, subscription);
          } finally {
            lockHeld = false;
          }
        }
      );
      paymentProvider.cancelStaleSubscriptions.mockImplementation(() => {
        expect(lockHeld).toBe(false);
        return Promise.resolve();
      });

      await target.createCheckoutSession(tenantUser);

      expect(paymentProvider.cancelStaleSubscriptions).toHaveBeenCalledWith(['sub_unpaid']);
    });

    it('throws AlreadySubscribedException instead of starting a second Checkout Session for a tenant with a live subscription', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
      });
      billingPlansDbService.findByCode.mockResolvedValue({
        id: 'plan-paid',
        code: BillingPlanCode.PAID,
        stripeProductId: null,
        stripePriceId: 'price_paid',
        maxLocations: null,
        maxAiDraftsPerMonth: null,
        maxTeamMembers: null,
        customPromptsEnabled: true,
      });

      await expect(target.createCheckoutSession(tenantUser)).rejects.toBeInstanceOf(
        AlreadySubscribedException
      );
      expect(paymentProvider.createCheckoutSession).not.toHaveBeenCalled();
    });

    describe('when Stripe already has a subscription the local row has not recorded', () => {
      const paidPlanRow = {
        id: 'plan-paid',
        code: BillingPlanCode.PAID,
        stripeProductId: null,
        stripePriceId: 'price_paid',
        maxLocations: null,
        maxAiDraftsPerMonth: null,
        maxTeamMembers: null,
        customPromptsEnabled: true,
      };

      beforeEach(() => {
        // Checkout completed, webhook not landed yet: customer known, no subscription id.
        tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
          ...baseSubscription,
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: null,
        });
        billingPlansDbService.findByCode.mockResolvedValue(paidPlanRow);
        paymentProvider.prepareNewCheckout.mockResolvedValue({
          hasLiveSubscription: true,
          staleSubscriptionIds: [],
        });
      });

      // Regression: a Back press from Stripe Checkout before the webhook landed could buy a second subscription.
      it('refuses a second Checkout and records the subscription it found', async () => {
        await expect(target.createCheckoutSession(tenantUser)).rejects.toBeInstanceOf(
          AlreadySubscribedException
        );
        expect(paymentProvider.createCheckoutSession).not.toHaveBeenCalled();
        expect(billingReconciliationService.reconcileTenantSubscription).toHaveBeenCalledWith({
          tenantId: tenantUser.tenantId,
          stripeCustomerId: 'cus_1',
        });
      });

      it('still refuses when recording it fails, leaving that to the webhook', async () => {
        billingReconciliationService.reconcileTenantSubscription.mockRejectedValue(
          new Error('stripe down')
        );

        await expect(target.createCheckoutSession(tenantUser)).rejects.toBeInstanceOf(
          AlreadySubscribedException
        );
        expect(paymentProvider.createCheckoutSession).not.toHaveBeenCalled();
      });
    });

    it('does not ask Stripe about a customer it is only now creating', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(baseSubscription);
      billingPlansDbService.findByCode.mockResolvedValue({
        id: 'plan-paid',
        code: BillingPlanCode.PAID,
        stripeProductId: null,
        stripePriceId: 'price_paid',
        maxLocations: null,
        maxAiDraftsPerMonth: null,
        maxTeamMembers: null,
        customPromptsEnabled: true,
      });
      paymentProvider.createCustomer.mockResolvedValue({ customerId: 'cus_test_new' });
      paymentProvider.createCheckoutSession.mockResolvedValue({
        url: 'https://example.com/checkout',
      });

      await target.createCheckoutSession(tenantUser);

      expect(paymentProvider.prepareNewCheckout).not.toHaveBeenCalled();
    });

    // `??` let an empty env var shadow the plan's own price id and reach Stripe as an empty price, after a customer had been minted for it.
    it.each([
      [
        'an empty STRIPE_PRICE_ID_PAID falls back to the plan’s own price',
        '',
        'price_from_db_column',
        'price_from_db_column',
      ],
    ])('%s', async (_name, envValue, dbValue, expected) => {
      const envTarget = new BillingService(
        billingPlansDbService as unknown as BillingPlansDbService,
        tenantSubscriptionsDbService as unknown as TenantSubscriptionsDbService,
        billingEntitlementsService as unknown as BillingEntitlementsService,
        billingReconciliationService as unknown as BillingReconciliationService,
        billingReceiptsDbService as unknown as BillingReceiptsDbService,
        authDbService as unknown as AuthDbService,
        paymentProvider as unknown as PaymentProvider,
        buildConfigService({ STRIPE_PRICE_ID_PAID: envValue })
      );
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(baseSubscription);
      billingPlansDbService.findByCode.mockResolvedValue({
        id: 'plan-paid',
        code: BillingPlanCode.PAID,
        stripeProductId: null,
        stripePriceId: dbValue,
        maxLocations: null,
        maxAiDraftsPerMonth: null,
        maxTeamMembers: null,
        customPromptsEnabled: true,
      });
      paymentProvider.createCustomer.mockResolvedValue({ customerId: 'cus_test_1' });
      paymentProvider.createCheckoutSession.mockResolvedValue({
        url: 'https://example.com/checkout',
      });

      await envTarget.createCheckoutSession(tenantUser);

      expect(paymentProvider.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ priceId: expected })
      );
    });

    it('refuses with PAYMENT_NOT_CONFIGURED, before creating a Stripe customer, when no price is configured anywhere', async () => {
      const envTarget = new BillingService(
        billingPlansDbService as unknown as BillingPlansDbService,
        tenantSubscriptionsDbService as unknown as TenantSubscriptionsDbService,
        billingEntitlementsService as unknown as BillingEntitlementsService,
        billingReconciliationService as unknown as BillingReconciliationService,
        billingReceiptsDbService as unknown as BillingReceiptsDbService,
        authDbService as unknown as AuthDbService,
        paymentProvider as unknown as PaymentProvider,
        buildConfigService({ STRIPE_PRICE_ID_PAID: '' })
      );
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(baseSubscription);
      billingPlansDbService.findByCode.mockResolvedValue({
        id: 'plan-paid',
        code: BillingPlanCode.PAID,
        stripeProductId: null,
        stripePriceId: null,
        maxLocations: null,
        maxAiDraftsPerMonth: null,
        maxTeamMembers: null,
        customPromptsEnabled: true,
      });

      await expect(envTarget.createCheckoutSession(tenantUser)).rejects.toMatchObject({
        response: { code: 'PAYMENT_NOT_CONFIGURED' },
      });
      expect(paymentProvider.createCustomer).not.toHaveBeenCalled();
      expect(paymentProvider.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('prefers STRIPE_PRICE_ID_PAID over billing_plans.stripe_price_id when both are set', async () => {
      const envPricedTarget = new BillingService(
        billingPlansDbService as unknown as BillingPlansDbService,
        tenantSubscriptionsDbService as unknown as TenantSubscriptionsDbService,
        billingEntitlementsService as unknown as BillingEntitlementsService,
        billingReconciliationService as unknown as BillingReconciliationService,
        billingReceiptsDbService as unknown as BillingReceiptsDbService,
        authDbService as unknown as AuthDbService,
        paymentProvider as unknown as PaymentProvider,
        buildConfigService({ STRIPE_PRICE_ID_PAID: 'price_from_env' })
      );
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(baseSubscription);
      billingPlansDbService.findByCode.mockResolvedValue({
        id: 'plan-paid',
        code: BillingPlanCode.PAID,
        stripeProductId: null,
        stripePriceId: 'price_from_db_column',
        maxLocations: null,
        maxAiDraftsPerMonth: null,
        maxTeamMembers: null,
        customPromptsEnabled: true,
      });
      paymentProvider.createCustomer.mockResolvedValue({ customerId: 'cus_test_1' });
      paymentProvider.createCheckoutSession.mockResolvedValue({
        url: 'https://example.com/checkout',
      });

      await envPricedTarget.createCheckoutSession(tenantUser);

      expect(paymentProvider.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ priceId: 'price_from_env' })
      );
    });
  });

  describe('cancelSubscription', () => {
    beforeEach(() => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        planId: 'plan-paid',
        status: SubscriptionStatus.ACTIVE,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
      });
    });

    it('throws SubscriptionNotFoundException when there is no active Stripe subscription', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: null,
      });

      await expect(target.cancelSubscription(tenantUser)).rejects.toBeInstanceOf(
        SubscriptionNotFoundException
      );
      expect(paymentProvider.cancelSubscription).not.toHaveBeenCalled();
    });

    it('calls the payment provider to cancel at period end', async () => {
      await target.cancelSubscription(tenantUser);

      expect(paymentProvider.cancelSubscription).toHaveBeenCalledWith('sub_1', true);
    });

    // Regression: an owner's cancellation must be distinguishable from an erasure's, or cancelling the erasure would resume (and charge) it.
    it("records the owner as the cancellation's source before calling the provider", async () => {
      await target.cancelSubscription(tenantUser);

      expect(tenantSubscriptionsDbService.markCancellationScheduled).toHaveBeenCalledWith(
        'tenant-1',
        SubscriptionCancellationSource.OWNER
      );
      expect(
        tenantSubscriptionsDbService.markCancellationScheduled.mock.invocationCallOrder[0]
      ).toBeLessThan(paymentProvider.cancelSubscription.mock.invocationCallOrder[0] ?? 0);
    });

    it('reverts the recorded source and rethrows when the provider refuses', async () => {
      paymentProvider.cancelSubscription.mockRejectedValue(new Error('stripe down'));

      await expect(target.cancelSubscription(tenantUser)).rejects.toThrow('stripe down');

      expect(tenantSubscriptionsDbService.restoreCancellationState).toHaveBeenCalledWith(
        'tenant-1',
        { cancelAtPeriodEnd: false, cancellationSource: null }
      );
    });

    // Clearing it outright lost the marker an erasure request had set, so cancelling the erasure later would resume (and bill) the subscription.
    it('puts back an erasure-scheduled cancellation, not nothing, when the owner’s own attempt fails', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        cancelAtPeriodEnd: true,
        cancellationSource: SubscriptionCancellationSource.ERASURE,
      });
      paymentProvider.cancelSubscription.mockRejectedValue(new Error('stripe down'));

      await expect(target.cancelSubscription(tenantUser)).rejects.toThrow('stripe down');

      expect(tenantSubscriptionsDbService.restoreCancellationState).toHaveBeenCalledWith(
        'tenant-1',
        { cancelAtPeriodEnd: true, cancellationSource: SubscriptionCancellationSource.ERASURE }
      );
      expect(tenantSubscriptionsDbService.clearCancellationScheduled).not.toHaveBeenCalled();
    });

    it('does not apply the change itself: the Stripe webhook does', async () => {
      await target.cancelSubscription(tenantUser);

      expect(paymentProvider.cancelSubscription).toHaveBeenCalledWith('sub_1', true);
    });
  });

  describe('listReceipts', () => {
    it('returns the tenant’s receipts as a DTO', async () => {
      billingReceiptsDbService.listByTenantId.mockResolvedValue([
        {
          id: 'receipt-1',
          tenantId: 'tenant-1',
          stripeInvoiceId: 'in_1',
          stripeSubscriptionId: 'sub_1',
          amountPaid: 4900,
          currency: 'usd',
          invoiceNumber: 'INV-0001',
          paidAt: '2026-09-01T00:00:00.000Z',
        },
      ]);

      const result = await target.listReceipts(tenantUser);

      expect(billingReceiptsDbService.listByTenantId).toHaveBeenCalledWith('tenant-1');
      expect(result.receipts).toEqual([
        {
          id: 'receipt-1',
          amountPaid: 4900,
          currency: 'usd',
          invoiceNumber: 'INV-0001',
          paidAt: '2026-09-01T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('downloadReceiptPdf', () => {
    const receiptRow = {
      id: 'receipt-1',
      tenantId: 'tenant-1',
      stripeInvoiceId: 'in_1',
      stripeSubscriptionId: 'sub_1',
      amountPaid: 4900,
      currency: 'usd',
      invoiceNumber: 'INV-0001',
      paidAt: '2026-09-01T00:00:00.000Z',
    };

    it('throws ReceiptNotFoundException when the receipt does not exist', async () => {
      billingReceiptsDbService.findByIdForTenant.mockResolvedValue(null);

      await expect(target.downloadReceiptPdf(tenantUser, 'receipt-1')).rejects.toBeInstanceOf(
        ReceiptNotFoundException
      );
    });

    it('scopes the lookup to the caller’s own tenant, at the query itself', async () => {
      billingReceiptsDbService.findByIdForTenant.mockResolvedValue(null);

      await expect(target.downloadReceiptPdf(tenantUser, 'receipt-1')).rejects.toBeInstanceOf(
        ReceiptNotFoundException
      );
      expect(billingReceiptsDbService.findByIdForTenant).toHaveBeenCalledWith(
        'receipt-1',
        'tenant-1'
      );
    });

    it('renders a real PDF buffer and a human-readable filename', async () => {
      billingReceiptsDbService.findByIdForTenant.mockResolvedValue(receiptRow);
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'Acme Inc',
      });

      const result = await target.downloadReceiptPdf(tenantUser, 'receipt-1');

      expect(result.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(result.filename).toBe('InnoPeak-Receipt-INV-0001.pdf');
    });

    it('falls back to the paid date for the filename when there is no invoice number', async () => {
      billingReceiptsDbService.findByIdForTenant.mockResolvedValue({
        ...receiptRow,
        invoiceNumber: null,
      });
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'Acme Inc',
      });

      const result = await target.downloadReceiptPdf(tenantUser, 'receipt-1');

      expect(result.filename).toBe('InnoPeak-Receipt-2026-09-01.pdf');
    });

    it('falls back to the caller’s email for the PDF when the tenant lookup misses', async () => {
      billingReceiptsDbService.findByIdForTenant.mockResolvedValue(receiptRow);
      authDbService.findTenantStatus.mockResolvedValue(null);

      const result = await target.downloadReceiptPdf(tenantUser, 'receipt-1');

      expect(result.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  describe('listPlans', () => {
    const free = {
      id: 'plan-free',
      code: BillingPlanCode.FREE,
      stripeProductId: null,
      stripePriceId: null,
      maxLocations: 1,
      maxAiDraftsPerMonth: 20,
      maxTeamMembers: 1,
      customPromptsEnabled: false,
    };

    it("shows each plan's own limits while payments are on", async () => {
      billingPlansDbService.listAll.mockResolvedValue([free]);
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(baseSubscription);

      const result = await target.listPlans(tenantUser);

      expect(result.plans[0]).toEqual(
        expect.objectContaining({
          maxLocations: 1,
          maxAiDraftsPerMonth: 20,
          customPromptsEnabled: false,
        })
      );
    });

    // Regression: with payments off the plan screen advertised Free's caps, which were no longer enforced.
    it('shows no limits while payments are off, matching what is enforced', async () => {
      const paymentsOff = new BillingService(
        billingPlansDbService as unknown as BillingPlansDbService,
        tenantSubscriptionsDbService as unknown as TenantSubscriptionsDbService,
        billingEntitlementsService as unknown as BillingEntitlementsService,
        billingReconciliationService as unknown as BillingReconciliationService,
        billingReceiptsDbService as unknown as BillingReceiptsDbService,
        authDbService as unknown as AuthDbService,
        paymentProvider as unknown as PaymentProvider,
        buildConfigService({ PAYMENT_FEATURE_ENABLED: 'false' })
      );
      billingPlansDbService.listAll.mockResolvedValue([free]);
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(baseSubscription);

      const result = await paymentsOff.listPlans(tenantUser);

      expect(result.plans[0]).toEqual(
        expect.objectContaining({
          code: BillingPlanCode.FREE,
          maxLocations: null,
          maxAiDraftsPerMonth: null,
          maxTeamMembers: null,
          customPromptsEnabled: true,
        })
      );
    });
  });

  describe('getSubscription', () => {
    it('reports the card on file for a tenant with a Stripe customer', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        stripeCustomerId: 'cus_1',
      });
      paymentProvider.getPaymentMethodSummary.mockResolvedValue({
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2030,
      });

      const result = await target.getSubscription(tenantUser);

      expect(paymentProvider.getPaymentMethodSummary).toHaveBeenCalledWith('cus_1');
      expect(result.paymentMethod).toEqual(expect.objectContaining({ last4: '4242' }));
    });

    // Regression: a customer id Stripe doesn't know (or no Stripe keys) failed the whole read, so Settings -> Billing never loaded.
    it('still answers, with no card, when the card lookup fails', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        stripeCustomerId: 'cus_unknown',
      });
      paymentProvider.getPaymentMethodSummary.mockRejectedValue(new Error('No such customer'));

      const result = await target.getSubscription(tenantUser);

      expect(result.paymentMethod).toBeNull();
      expect(result.planCode).toBeDefined();
    });
  });

  describe('reconcileCheckoutSession', () => {
    it('delegates to BillingReconciliationService with the caller own tenant id, then returns the refreshed subscription', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        planId: 'plan-paid',
      });
      const result = await target.reconcileCheckoutSession(tenantUser, 'cs_test_123');

      expect(billingReconciliationService.reconcileFromCheckoutSession).toHaveBeenCalledWith({
        tenantId: tenantUser.tenantId,
        checkoutSessionId: 'cs_test_123',
      });
      expect(result.planCode).toBeDefined();
    });

    it('propagates whatever BillingReconciliationService throws (e.g. a tenant mismatch) without touching the subscription read', async () => {
      billingReconciliationService.reconcileFromCheckoutSession.mockRejectedValue(
        new Error('CHECKOUT_SESSION_TENANT_MISMATCH')
      );

      await expect(
        target.reconcileCheckoutSession(tenantUser, 'cs_test_someone_elses')
      ).rejects.toThrow('CHECKOUT_SESSION_TENANT_MISMATCH');
      expect(tenantSubscriptionsDbService.findByTenantId).not.toHaveBeenCalled();
    });
  });

  describe('in-app billing profile / card management', () => {
    beforeEach(() => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        stripeCustomerId: 'cus_1',
      });
    });

    describe('getBillingProfile', () => {
      it('throws SubscriptionNotFoundException when there is no Stripe customer yet', async () => {
        tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(baseSubscription);

        await expect(target.getBillingProfile(tenantUser)).rejects.toBeInstanceOf(
          SubscriptionNotFoundException
        );
      });

      it('returns the profile the provider reports', async () => {
        paymentProvider.getBillingProfile.mockResolvedValue({
          name: 'Jordan Lee',
          email: 'jordan@example.com',
        });

        const result = await target.getBillingProfile(tenantUser);

        expect(paymentProvider.getBillingProfile).toHaveBeenCalledWith('cus_1');
        expect(result).toEqual({ name: 'Jordan Lee', email: 'jordan@example.com' });
      });
    });

    describe('updateBillingProfile', () => {
      it('passes the new name/email straight through to the provider', async () => {
        paymentProvider.updateBillingProfile.mockResolvedValue({
          name: 'Jordan Lee',
          email: 'jordan@example.com',
        });

        await target.updateBillingProfile(tenantUser, {
          name: 'Jordan Lee',
          email: 'jordan@example.com',
        });

        expect(paymentProvider.updateBillingProfile).toHaveBeenCalledWith('cus_1', {
          name: 'Jordan Lee',
          email: 'jordan@example.com',
        });
      });
    });

    describe('createSetupIntent', () => {
      it('returns the client secret the provider mints', async () => {
        paymentProvider.createSetupIntent.mockResolvedValue({ clientSecret: 'seti_1_secret_abc' });

        const result = await target.createSetupIntent(tenantUser);

        expect(paymentProvider.createSetupIntent).toHaveBeenCalledWith('cus_1');
        expect(result.clientSecret).toBe('seti_1_secret_abc');
      });
    });

    describe('setDefaultPaymentMethod', () => {
      it('passes the payment method id straight through to the provider', async () => {
        await target.setDefaultPaymentMethod(tenantUser, 'pm_1');

        expect(paymentProvider.setDefaultPaymentMethod).toHaveBeenCalledWith('cus_1', 'pm_1');
      });
    });
  });
});
