import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ReconcileCheckoutSessionDto } from './reconcile-checkout-session.dto';
import { SetDefaultPaymentMethodDto } from './set-default-payment-method.dto';

/**
 * Mirrors the global ValidationPipe (bootstrap.ts). Implicit conversion turns `123`, `true` and `{}`
 * into strings before @IsString() runs, so without a shape check they reached Stripe and returned a 500.
 */
async function errorsFor<T extends object>(cls: new () => T, body: Record<string, unknown>) {
  const instance = plainToInstance(cls, body, { enableImplicitConversion: true });
  return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
}

describe('SetDefaultPaymentMethodDto', () => {
  it('accepts a real PaymentMethod id', async () => {
    expect(
      await errorsFor(SetDefaultPaymentMethodDto, { paymentMethodId: 'pm_1P0a2bC3dE4fG5h' })
    ).toEqual([]);
  });

  it.each([
    123,
    true,
    {},
    -1,
    'x'.repeat(5001),
    "' OR 1=1 --",
    '<script>alert(1)</script>',
    'cus_123',
  ])('rejects %p before it reaches Stripe', async value => {
    const errors = await errorsFor(SetDefaultPaymentMethodDto, { paymentMethodId: value });
    expect(errors.map(e => e.property)).toContain('paymentMethodId');
  });
});

describe('ReconcileCheckoutSessionDto', () => {
  it('accepts a Checkout Session id', async () => {
    expect(
      await errorsFor(ReconcileCheckoutSessionDto, {
        checkoutSessionId: 'cs_test_a195zqd4lPZlQLI4zm8I',
      })
    ).toEqual([]);
  });

  it.each(['x'.repeat(256), '<script>alert(1)</script>', String.fromCharCode(0), 'has space', ''])(
    'rejects %p',
    async value => {
      const errors = await errorsFor(ReconcileCheckoutSessionDto, { checkoutSessionId: value });
      expect(errors.map(e => e.property)).toContain('checkoutSessionId');
    }
  );
});
