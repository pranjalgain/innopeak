import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { TenantAuthUser } from '@auth/types/auth-user.type';
import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import type { EnvConfig } from '@config/env.config';
import type { DrizzleTransaction } from '@db/db.service';
import type { AuthDbService } from '@db/repositories/auth/auth.db-service';
import type { BillingPlansDbService } from '@db/repositories/billing/billing-plans.db-service';
import type { BillingReceiptsDbService } from '@db/repositories/billing/billing-receipts.db-service';
import type { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import type { TenantSubscriptionRow } from '@db/repositories/billing/tenant-subscriptions.repository';
import type { ConfigService } from '@nestjs/config';

import type { BillingEntitlementsService } from './billing-entitlements.service';
import type { BillingWebhooksService } from './billing-webhooks.service';
import { BillingService } from './billing.service';

import {
  AlreadySubscribedException,
  BillingNotEnabledException,
  DummyProviderNotActiveException,
  ReceiptNotFoundException,
  StripeOnlyFeatureException,
  SubscriptionNotFoundException,
} from '../exceptions/billing.exceptions';
import type { PaymentProvider } from '../providers/payment.provider';

/** Opaque stand-in for the real Drizzle transaction handle `withCheckoutLock` threads through. */
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
};

/** Matches `EnvConfig`'s real key set closely enough for `ConfigService.get()` to answer the two
 *  keys `BillingService` actually reads (`FRONTEND_URL`, `PAYMENT_FEATURE_ENABLED`) — everything
 *  else resolves to `undefined`, same as a real `ConfigService` would for an unset var. */
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
  let billingPlansDbService: jest.Mocked<Pick<BillingPlansDbService, 'findByCode'>>;
  let tenantSubscriptionsDbService: jest.Mocked<
    Pick<
      TenantSubscriptionsDbService,
      'attachStripeCustomerId' | 'findByTenantId' | 'withCheckoutLock'
    >
  >;
  let billingEntitlementsService: jest.Mocked<
    Pick<BillingEntitlementsService, 'getEntitlements' | 'setActiveLocationForPlan'>
  >;
  let billingWebhooksService: jest.Mocked<Pick<BillingWebhooksService, 'handleEvent'>>;
  let billingReceiptsDbService: jest.Mocked<
    Pick<BillingReceiptsDbService, 'findByIdForTenant' | 'listByTenantId'>
  >;
  let authDbService: jest.Mocked<Pick<AuthDbService, 'findTenantStatus'>>;
  // `type` is `readonly` on the real `PaymentProvider` — mutable here so tests can flip it to
  // simulate the active provider changing, which a plain `Pick<PaymentProvider, ...>` would forbid.
  let paymentProvider: {
    type: PaymentProvider['type'];
    createCustomer: jest.Mock;
    createCheckoutSession: jest.Mock;
    createPortalSession: jest.Mock;
    cancelSubscription: jest.Mock;
    getPaymentMethodSummary: jest.Mock;
    getBillingProfile: jest.Mock;
    updateBillingProfile: jest.Mock;
    createSetupIntent: jest.Mock;
    setDefaultPaymentMethod: jest.Mock;
  };

  beforeEach(() => {
    billingPlansDbService = { findByCode: jest.fn() };
    tenantSubscriptionsDbService = {
      findByTenantId: jest.fn(),
      attachStripeCustomerId: jest.fn().mockResolvedValue(baseSubscription),
      // Mirrors the real `TenantSubscriptionsDbService.withCheckoutLock`: resolves the tenant's
      // current row (via this same mock's own `findByTenantId`, so existing
      // `findByTenantId.mockResolvedValue(...)` setups keep working) and hands it to the callback
      // along with a fake tx handle — there's no real transaction/lock to simulate here, only the
      // shape `BillingService.createCheckoutSession` depends on.
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
    billingWebhooksService = { handleEvent: jest.fn() };
    billingReceiptsDbService = {
      listByTenantId: jest.fn().mockResolvedValue([]),
      findByIdForTenant: jest.fn().mockResolvedValue(null),
    };
    authDbService = {
      findTenantStatus: jest.fn().mockResolvedValue({ status: 'active', name: 'Acme Inc' }),
    };
    paymentProvider = {
      type: 'dummy',
      createCustomer: jest.fn(),
      createCheckoutSession: jest.fn(),
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
      billingWebhooksService as unknown as BillingWebhooksService,
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
        billingWebhooksService as unknown as BillingWebhooksService,
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
      paymentProvider.createCustomer.mockResolvedValue({ customerId: 'dummy_cus_1' });
      paymentProvider.createCheckoutSession.mockResolvedValue({
        url: 'https://example.com/checkout',
      });

      const result = await target.createCheckoutSession(tenantUser);

      expect(result).toEqual({ url: 'https://example.com/checkout' });
      expect(paymentProvider.createCheckoutSession).toHaveBeenCalledTimes(1);
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
      expect(paymentProvider.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cus_existing' })
      );
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

    it('prefers STRIPE_PRICE_ID_PAID over billing_plans.stripe_price_id when both are set', async () => {
      const envPricedTarget = new BillingService(
        billingPlansDbService as unknown as BillingPlansDbService,
        tenantSubscriptionsDbService as unknown as TenantSubscriptionsDbService,
        billingEntitlementsService as unknown as BillingEntitlementsService,
        billingWebhooksService as unknown as BillingWebhooksService,
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
      paymentProvider.createCustomer.mockResolvedValue({ customerId: 'dummy_cus_1' });
      paymentProvider.createCheckoutSession.mockResolvedValue({
        url: 'https://example.com/checkout',
      });

      await envPricedTarget.createCheckoutSession(tenantUser);

      expect(paymentProvider.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ priceId: 'price_from_env' })
      );
    });
  });

  describe('completeDummyCheckout', () => {
    beforeEach(() => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        stripeCustomerId: 'dummy_cus_1',
      });
    });

    it('throws DummyProviderNotActiveException when the active provider is not dummy', async () => {
      paymentProvider.type = 'stripe';

      await expect(target.completeDummyCheckout(tenantUser, 'dummy_sub_1')).rejects.toBeInstanceOf(
        DummyProviderNotActiveException
      );
      expect(billingWebhooksService.handleEvent).not.toHaveBeenCalled();
    });

    it('throws SubscriptionNotFoundException when the tenant has no Stripe customer yet', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(baseSubscription);

      await expect(target.completeDummyCheckout(tenantUser, 'dummy_sub_1')).rejects.toBeInstanceOf(
        SubscriptionNotFoundException
      );
      expect(billingWebhooksService.handleEvent).not.toHaveBeenCalled();
    });

    it('hands BillingWebhooksService a checkout.session.completed event for this tenant', async () => {
      await target.completeDummyCheckout(tenantUser, 'dummy_sub_1');

      expect(billingWebhooksService.handleEvent).toHaveBeenCalledTimes(1);
      const event = billingWebhooksService.handleEvent.mock.calls[0]?.[0];
      expect(event).toMatchObject({
        type: 'checkout.session.completed',
        customerId: 'dummy_cus_1',
        subscriptionId: 'dummy_sub_1',
      });
      expect(event?.id).toMatch(/^dummy_evt_/);
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

    it('calls the payment provider to cancel at period end, for any provider', async () => {
      paymentProvider.type = 'stripe';

      await target.cancelSubscription(tenantUser);

      expect(paymentProvider.cancelSubscription).toHaveBeenCalledWith('sub_1', true);
    });

    it('does not touch BillingWebhooksService for a real provider — its own webhook applies the change', async () => {
      paymentProvider.type = 'stripe';

      await target.cancelSubscription(tenantUser);

      expect(billingWebhooksService.handleEvent).not.toHaveBeenCalled();
    });

    it('applies the state change itself for Dummy — it has no real webhook caller', async () => {
      await target.cancelSubscription(tenantUser);

      expect(billingWebhooksService.handleEvent).toHaveBeenCalledTimes(1);
      const event = billingWebhooksService.handleEvent.mock.calls[0]?.[0];
      expect(event).toMatchObject({
        type: 'customer.subscription.updated',
        customerId: 'cus_1',
        subscriptionId: 'sub_1',
        cancelAtPeriodEnd: true,
      });
      expect(event?.id).toMatch(/^dummy_evt_/);
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
      // A cross-tenant id has nothing to find — the query is scoped by tenantId, not a
      // fetch-then-compare in the service — so this resolves the same as "doesn't exist".
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

  describe('getSubscription', () => {
    it('reports the active payment provider so the frontend can gate in-app billing editing', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(baseSubscription);
      paymentProvider.type = 'stripe';

      const result = await target.getSubscription(tenantUser);

      expect(result.paymentProvider).toBe('stripe');
    });
  });

  describe('in-app billing profile / card management', () => {
    beforeEach(() => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        stripeCustomerId: 'cus_1',
      });
      paymentProvider.type = 'stripe';
    });

    describe('getBillingProfile', () => {
      it('throws StripeOnlyFeatureException when the active provider is dummy', async () => {
        paymentProvider.type = 'dummy';

        await expect(target.getBillingProfile(tenantUser)).rejects.toBeInstanceOf(
          StripeOnlyFeatureException
        );
        expect(paymentProvider.getBillingProfile).not.toHaveBeenCalled();
      });

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
      it('throws StripeOnlyFeatureException when the active provider is dummy', async () => {
        paymentProvider.type = 'dummy';

        await expect(
          target.updateBillingProfile(tenantUser, {
            name: 'Jordan Lee',
            email: 'jordan@example.com',
          })
        ).rejects.toBeInstanceOf(StripeOnlyFeatureException);
      });

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
      it('throws StripeOnlyFeatureException when the active provider is dummy', async () => {
        paymentProvider.type = 'dummy';

        await expect(target.createSetupIntent(tenantUser)).rejects.toBeInstanceOf(
          StripeOnlyFeatureException
        );
      });

      it('returns the client secret the provider mints', async () => {
        paymentProvider.createSetupIntent.mockResolvedValue({ clientSecret: 'seti_1_secret_abc' });

        const result = await target.createSetupIntent(tenantUser);

        expect(paymentProvider.createSetupIntent).toHaveBeenCalledWith('cus_1');
        expect(result.clientSecret).toBe('seti_1_secret_abc');
      });
    });

    describe('setDefaultPaymentMethod', () => {
      it('throws StripeOnlyFeatureException when the active provider is dummy', async () => {
        paymentProvider.type = 'dummy';

        await expect(target.setDefaultPaymentMethod(tenantUser, 'pm_1')).rejects.toBeInstanceOf(
          StripeOnlyFeatureException
        );
      });

      it('passes the payment method id straight through to the provider', async () => {
        await target.setDefaultPaymentMethod(tenantUser, 'pm_1');

        expect(paymentProvider.setDefaultPaymentMethod).toHaveBeenCalledWith('cus_1', 'pm_1');
      });
    });
  });
});
