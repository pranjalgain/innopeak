import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';

import { DummyPaymentProvider } from './dummy-payment.provider';

import { BILLING_REDIRECT_PATHS } from '../constants/billing.constants';

describe('DummyPaymentProvider', () => {
  let target: DummyPaymentProvider;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue('https://app.innopeak.test'),
    } as unknown as ConfigService<EnvConfig>;
    target = new DummyPaymentProvider(configService);
  });

  it('reports its type as dummy', () => {
    expect(target.type).toBe('dummy');
  });

  it('mints a fabricated dummy_cus_* id, never a real Stripe id', async () => {
    const result = await target.createCustomer({ tenantId: 'tenant-1', email: 'a@b.com' });

    expect(result.customerId).toMatch(/^dummy_cus_[0-9a-f-]{36}$/);
  });

  it('returns a checkout confirmation URL carrying tenantId/customerId/a fresh dummy_sub_* id', async () => {
    const result = await target.createCheckoutSession({
      tenantId: 'tenant-1',
      customerId: 'dummy_cus_abc',
      priceId: 'price_1',
      successUrl: 'https://app.innopeak.test/success',
      cancelUrl: 'https://app.innopeak.test/cancel',
    });

    const url = new URL(result.url);
    expect(url.pathname).toBe(BILLING_REDIRECT_PATHS.DUMMY_CHECKOUT);
    expect(url.searchParams.get('tenantId')).toBe('tenant-1');
    expect(url.searchParams.get('customerId')).toBe('dummy_cus_abc');
    expect(url.searchParams.get('subscriptionId')).toMatch(/^dummy_sub_[0-9a-f-]{36}$/);
  });

  it('mints a different subscription id on every call (never reuses one)', async () => {
    const first = await target.createCheckoutSession({
      tenantId: 'tenant-1',
      customerId: 'dummy_cus_abc',
      priceId: 'price_1',
      successUrl: '',
      cancelUrl: '',
    });
    const second = await target.createCheckoutSession({
      tenantId: 'tenant-1',
      customerId: 'dummy_cus_abc',
      priceId: 'price_1',
      successUrl: '',
      cancelUrl: '',
    });

    const firstId = new URL(first.url).searchParams.get('subscriptionId');
    const secondId = new URL(second.url).searchParams.get('subscriptionId');
    expect(firstId).not.toBe(secondId);
  });

  it('returns a portal confirmation URL carrying the customerId', async () => {
    const result = await target.createPortalSession({
      customerId: 'dummy_cus_abc',
      returnUrl: 'https://app.innopeak.test/return',
    });

    const url = new URL(result.url);
    expect(url.pathname).toBe(BILLING_REDIRECT_PATHS.DUMMY_PORTAL);
    expect(url.searchParams.get('customerId')).toBe('dummy_cus_abc');
  });

  it('cancelSubscription resolves without contacting any real payment network', async () => {
    await expect(target.cancelSubscription('dummy_sub_abc', true)).resolves.toBeUndefined();
    await expect(target.cancelSubscription('dummy_sub_abc', false)).resolves.toBeUndefined();
  });

  it('returns the fixed fixture card for any customerId', async () => {
    const result = await target.getPaymentMethodSummary('dummy_cus_abc');

    expect(result).toEqual({ brand: 'visa', last4: '4242', expMonth: 12, expYear: 2034 });
  });

  it('constructWebhookEvent throws — Dummy has no external webhook caller', () => {
    expect(() => target.constructWebhookEvent(Buffer.from(''), '')).toThrow();
  });

  it('rejects in-app billing profile/card management — no real Stripe customer to act on', async () => {
    await expect(target.getBillingProfile('dummy_cus_abc')).rejects.toThrow();
    await expect(
      target.updateBillingProfile('dummy_cus_abc', {
        name: 'Jordan Lee',
        email: 'jordan@example.com',
      })
    ).rejects.toThrow();
    await expect(target.createSetupIntent('dummy_cus_abc')).rejects.toThrow();
    await expect(target.setDefaultPaymentMethod('dummy_cus_abc', 'pm_1')).rejects.toThrow();
  });

  it('never reports a live subscription before Checkout: Dummy records a completed one on the row synchronously', async () => {
    await expect(target.prepareNewCheckout('dummy_cus_abc')).resolves.toEqual({
      hasLiveSubscription: false,
    });
  });
});
