import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';

const mockStripeInstance = {
  customers: { create: jest.fn(), retrieve: jest.fn(), update: jest.fn(), del: jest.fn() },
  checkout: { sessions: { create: jest.fn(), retrieve: jest.fn() } },
  billingPortal: { sessions: { create: jest.fn() } },
  subscriptions: { update: jest.fn(), cancel: jest.fn() },
  paymentMethods: { list: jest.fn() },
  setupIntents: { create: jest.fn() },
  webhooks: { constructEvent: jest.fn() },
  invoices: { list: jest.fn(), voidInvoice: jest.fn() },
};

jest.mock('stripe', () => jest.fn().mockImplementation(() => mockStripeInstance));

import { StripePaymentProvider } from './stripe-payment.provider';

import {
  CheckoutSessionTenantMismatchException,
  PaymentMethodNotUsableException,
} from '../exceptions/billing.exceptions';

describe('StripePaymentProvider', () => {
  let target: StripePaymentProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    const configService = {
      get: jest.fn().mockReturnValue('sk_test_dummy'),
    } as unknown as ConfigService<EnvConfig>;
    target = new StripePaymentProvider(configService);
  });

  describe('idempotency keys', () => {
    it('createCustomer sends a key deterministic per-tenant, so a retry after a failed DB write reuses the same Stripe customer', async () => {
      mockStripeInstance.customers.create.mockResolvedValue({ id: 'cus_1' });

      await target.createCustomer({ tenantId: 'tenant-1', email: 'a@b.com' });
      await target.createCustomer({ tenantId: 'tenant-1', email: 'a@b.com' });

      expect(mockStripeInstance.customers.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ email: 'a@b.com' }),
        { idempotencyKey: 'billing_customer_tenant-1' }
      );
      const [, firstOptions] = mockStripeInstance.customers.create.mock.calls[0] as [
        unknown,
        { idempotencyKey: string },
      ];
      const [, secondOptions] = mockStripeInstance.customers.create.mock.calls[1] as [
        unknown,
        { idempotencyKey: string },
      ];
      expect(secondOptions.idempotencyKey).toBe(firstOptions.idempotencyKey);
    });

    it('createCheckoutSession sends a fresh key on every call', async () => {
      mockStripeInstance.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/session',
      });

      await target.createCheckoutSession({
        tenantId: 'tenant-1',
        customerId: 'cus_1',
        priceId: 'price_1',
        successUrl: 'https://app.test/success',
        cancelUrl: 'https://app.test/cancel',
      });
      await target.createCheckoutSession({
        tenantId: 'tenant-1',
        customerId: 'cus_1',
        priceId: 'price_1',
        successUrl: 'https://app.test/success',
        cancelUrl: 'https://app.test/cancel',
      });

      const [, firstOptions] = mockStripeInstance.checkout.sessions.create.mock.calls[0] as [
        unknown,
        { idempotencyKey: string },
      ];
      const [, secondOptions] = mockStripeInstance.checkout.sessions.create.mock.calls[1] as [
        unknown,
        { idempotencyKey: string },
      ];
      expect(firstOptions.idempotencyKey).toEqual(expect.any(String));
      expect(secondOptions.idempotencyKey).not.toBe(firstOptions.idempotencyKey);
    });

    it('createPortalSession sends a fresh key on every call', async () => {
      mockStripeInstance.billingPortal.sessions.create.mockResolvedValue({
        url: 'https://billing.stripe.com/session',
      });

      await target.createPortalSession({
        customerId: 'cus_1',
        returnUrl: 'https://app.test/return',
      });
      await target.createPortalSession({
        customerId: 'cus_1',
        returnUrl: 'https://app.test/return',
      });

      const [, firstOptions] = mockStripeInstance.billingPortal.sessions.create.mock.calls[0] as [
        unknown,
        { idempotencyKey: string },
      ];
      const [, secondOptions] = mockStripeInstance.billingPortal.sessions.create.mock.calls[1] as [
        unknown,
        { idempotencyKey: string },
      ];
      expect(secondOptions.idempotencyKey).not.toBe(firstOptions.idempotencyKey);
    });

    /** Regression-by-design: Stripe replays a key's first response for 24 hours, so a fixed key
     *  would make cancel → resume → cancel again silently skip the second cancel. */
    it('cancelSubscription(atPeriodEnd=true) uses a fresh key every call', async () => {
      mockStripeInstance.subscriptions.update.mockResolvedValue({});

      await target.cancelSubscription('sub_1', true);
      await target.cancelSubscription('sub_1', true);

      const keys = mockStripeInstance.subscriptions.update.mock.calls.map(
        call => (call[2] as { idempotencyKey: string }).idempotencyKey
      );
      expect(keys[0]).toEqual(expect.any(String));
      expect(keys[1]).not.toBe(keys[0]);
      expect(mockStripeInstance.subscriptions.update).toHaveBeenCalledWith(
        'sub_1',
        { cancel_at_period_end: true },
        expect.anything()
      );
    });

    it('resumeSubscription clears cancel_at_period_end with a fresh key every call', async () => {
      mockStripeInstance.subscriptions.update.mockResolvedValue({});

      await target.resumeSubscription('sub_1');
      await target.resumeSubscription('sub_1');

      expect(mockStripeInstance.subscriptions.update).toHaveBeenCalledWith(
        'sub_1',
        { cancel_at_period_end: false },
        expect.anything()
      );
      const keys = mockStripeInstance.subscriptions.update.mock.calls.map(
        call => (call[2] as { idempotencyKey: string }).idempotencyKey
      );
      expect(keys[1]).not.toBe(keys[0]);
    });

    it('voidOpenInvoices voids every open invoice of the subscription and counts them', async () => {
      mockStripeInstance.invoices.list.mockResolvedValue({
        data: [{ id: 'in_1' }, { id: 'in_2' }],
      });
      mockStripeInstance.invoices.voidInvoice.mockResolvedValue({});

      await expect(target.voidOpenInvoices('sub_1')).resolves.toBe(2);

      expect(mockStripeInstance.invoices.list).toHaveBeenCalledWith({
        subscription: 'sub_1',
        status: 'open',
      });
      expect(mockStripeInstance.invoices.voidInvoice).toHaveBeenCalledWith('in_1');
      expect(mockStripeInstance.invoices.voidInvoice).toHaveBeenCalledWith('in_2');
    });

    it('cancelSubscription(atPeriodEnd=false) sends a deterministic key naming the subscription and action', async () => {
      mockStripeInstance.subscriptions.cancel.mockResolvedValue({});

      await target.cancelSubscription('sub_1', false);

      expect(mockStripeInstance.subscriptions.cancel).toHaveBeenCalledWith(
        'sub_1',
        {},
        { idempotencyKey: 'billing_cancel_sub_1_immediate' }
      );
    });

    it('cancelSubscription uses distinct keys for the two actions on the same subscription', async () => {
      mockStripeInstance.subscriptions.update.mockResolvedValue({});
      mockStripeInstance.subscriptions.cancel.mockResolvedValue({});

      await target.cancelSubscription('sub_1', true);
      await target.cancelSubscription('sub_1', false);

      const [, , updateOptions] = mockStripeInstance.subscriptions.update.mock.calls[0] as [
        unknown,
        unknown,
        { idempotencyKey: string },
      ];
      const [, , cancelOptions] = mockStripeInstance.subscriptions.cancel.mock.calls[0] as [
        unknown,
        unknown,
        { idempotencyKey: string },
      ];
      expect(updateOptions.idempotencyKey).not.toBe(cancelOptions.idempotencyKey);
    });
  });

  describe('getPaymentMethodSummary', () => {
    const CARD = { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 };

    it('returns the customer default_payment_method card when present', async () => {
      mockStripeInstance.customers.retrieve.mockResolvedValue({
        deleted: false,
        invoice_settings: { default_payment_method: { card: CARD } },
      });

      const result = await target.getPaymentMethodSummary('cus_1');

      expect(result).toEqual({ brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 });
      expect(mockStripeInstance.paymentMethods.list).not.toHaveBeenCalled();
    });

    it('falls back to the first listed card when there is no default_payment_method', async () => {
      mockStripeInstance.customers.retrieve.mockResolvedValue({
        deleted: false,
        invoice_settings: { default_payment_method: null },
      });
      mockStripeInstance.paymentMethods.list.mockResolvedValue({ data: [{ card: CARD }] });

      const result = await target.getPaymentMethodSummary('cus_1');

      expect(mockStripeInstance.paymentMethods.list).toHaveBeenCalledWith({
        customer: 'cus_1',
        type: 'card',
      });
      expect(result).toEqual({ brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 });
    });

    it('returns null for a deleted customer, without listing payment methods', async () => {
      mockStripeInstance.customers.retrieve.mockResolvedValue({ deleted: true });

      const result = await target.getPaymentMethodSummary('cus_1');

      expect(result).toBeNull();
      expect(mockStripeInstance.paymentMethods.list).not.toHaveBeenCalled();
    });

    it('returns null when the customer has no default method and no cards on file', async () => {
      mockStripeInstance.customers.retrieve.mockResolvedValue({
        deleted: false,
        invoice_settings: { default_payment_method: null },
      });
      mockStripeInstance.paymentMethods.list.mockResolvedValue({ data: [] });

      const result = await target.getPaymentMethodSummary('cus_1');

      expect(result).toBeNull();
    });
  });

  describe('getBillingProfile', () => {
    it('returns the customer name/email', async () => {
      mockStripeInstance.customers.retrieve.mockResolvedValue({
        deleted: false,
        name: 'Jordan Lee',
        email: 'jordan@example.com',
      });

      const result = await target.getBillingProfile('cus_1');

      expect(result).toEqual({ name: 'Jordan Lee', email: 'jordan@example.com' });
    });

    it('falls back to null for a name/email Stripe never set', async () => {
      mockStripeInstance.customers.retrieve.mockResolvedValue({
        deleted: false,
        name: null,
        email: null,
      });

      const result = await target.getBillingProfile('cus_1');

      expect(result).toEqual({ name: null, email: null });
    });

    it('returns nulls for a deleted customer rather than throwing', async () => {
      mockStripeInstance.customers.retrieve.mockResolvedValue({ deleted: true });

      const result = await target.getBillingProfile('cus_1');

      expect(result).toEqual({ name: null, email: null });
    });
  });

  describe('updateBillingProfile', () => {
    it('writes name/email onto the Stripe customer and returns the updated profile', async () => {
      mockStripeInstance.customers.update.mockResolvedValue({
        name: 'Jordan Lee',
        email: 'jordan@example.com',
      });

      const result = await target.updateBillingProfile('cus_1', {
        name: 'Jordan Lee',
        email: 'jordan@example.com',
      });

      expect(mockStripeInstance.customers.update).toHaveBeenCalledWith('cus_1', {
        name: 'Jordan Lee',
        email: 'jordan@example.com',
      });
      expect(result).toEqual({ name: 'Jordan Lee', email: 'jordan@example.com' });
    });
  });

  describe('retrieveCheckoutSession', () => {
    it('reads the tenant id from the session metadata and maps its expanded subscription', async () => {
      mockStripeInstance.checkout.sessions.retrieve.mockResolvedValue({
        metadata: { tenantId: 'tenant-1' },
        subscription: null,
      });

      await expect(target.retrieveCheckoutSession('cs_test_1')).resolves.toEqual({
        tenantId: 'tenant-1',
        subscription: null,
      });
    });

    it('reports a session id Stripe has never heard of as a 404, not a server error', async () => {
      mockStripeInstance.checkout.sessions.retrieve.mockRejectedValue(
        Object.assign(new Error('No such checkout.session: cs_test_nope'), {
          type: 'StripeInvalidRequestError',
          code: 'resource_missing',
        })
      );

      await expect(target.retrieveCheckoutSession('cs_test_nope')).rejects.toBeInstanceOf(
        CheckoutSessionTenantMismatchException
      );
    });

    it('still surfaces any other Stripe failure as is', async () => {
      const outage = Object.assign(new Error('connection error'), {
        type: 'StripeConnectionError',
      });
      mockStripeInstance.checkout.sessions.retrieve.mockRejectedValue(outage);

      await expect(target.retrieveCheckoutSession('cs_test_1')).rejects.toBe(outage);
    });
  });

  describe('deleteCustomer', () => {
    it('deletes the customer', async () => {
      mockStripeInstance.customers.del.mockResolvedValue({ deleted: true });

      await target.deleteCustomer('cus_1');

      expect(mockStripeInstance.customers.del).toHaveBeenCalledWith('cus_1');
    });

    it('treats a customer Stripe no longer has as already deleted', async () => {
      mockStripeInstance.customers.del.mockRejectedValue(
        Object.assign(new Error('No such customer'), { code: 'resource_missing' })
      );

      await expect(target.deleteCustomer('cus_1')).resolves.toBeUndefined();
    });

    it('rethrows any other failure so the erasure purge retries', async () => {
      const outage = Object.assign(new Error('connection error'), {
        type: 'StripeConnectionError',
      });
      mockStripeInstance.customers.del.mockRejectedValue(outage);

      await expect(target.deleteCustomer('cus_1')).rejects.toBe(outage);
    });
  });

  describe('createSetupIntent', () => {
    it('creates a SetupIntent for the customer and returns its client secret', async () => {
      mockStripeInstance.setupIntents.create.mockResolvedValue({
        client_secret: 'seti_1_secret_abc',
      });

      const result = await target.createSetupIntent('cus_1');

      expect(mockStripeInstance.setupIntents.create).toHaveBeenCalledWith(
        { customer: 'cus_1', payment_method_types: ['card'], usage: 'off_session' },
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      );
      expect(result).toEqual({ clientSecret: 'seti_1_secret_abc' });
    });

    it('throws when Stripe does not return a client secret', async () => {
      mockStripeInstance.setupIntents.create.mockResolvedValue({ client_secret: null });

      await expect(target.createSetupIntent('cus_1')).rejects.toThrow(
        'Stripe did not return a SetupIntent client secret'
      );
    });
  });

  describe('setDefaultPaymentMethod', () => {
    it('reports a payment method Stripe rejects as a 400, not a server error', async () => {
      mockStripeInstance.customers.update.mockRejectedValue(
        Object.assign(new Error('The customer does not have a payment method with the ID pm_x'), {
          type: 'StripeInvalidRequestError',
        })
      );

      await expect(target.setDefaultPaymentMethod('cus_1', 'pm_x')).rejects.toBeInstanceOf(
        PaymentMethodNotUsableException
      );
    });

    it('still surfaces other Stripe failures as is', async () => {
      const outage = Object.assign(new Error('connection error'), {
        type: 'StripeConnectionError',
      });
      mockStripeInstance.customers.update.mockRejectedValue(outage);

      await expect(target.setDefaultPaymentMethod('cus_1', 'pm_x')).rejects.toBe(outage);
    });

    it("sets the payment method as the customer's default invoice payment method", async () => {
      mockStripeInstance.customers.update.mockResolvedValue({});

      await target.setDefaultPaymentMethod('cus_1', 'pm_1');

      expect(mockStripeInstance.customers.update).toHaveBeenCalledWith('cus_1', {
        invoice_settings: { default_payment_method: 'pm_1' },
      });
    });
  });
});
