import { PaymentProviderUnavailableException } from './payment-provider-unavailable.exception';
import { mapProviderFailure } from './provider-failure.mapper';

describe('mapProviderFailure', () => {
  it.each([
    'StripeConnectionError',
    'StripeAPIError',
    'StripeRateLimitError',
    'StripeAuthenticationError',
  ])('turns a %s into 503 PAYMENT_PROVIDER_UNAVAILABLE', type => {
    const mapped = mapProviderFailure(Object.assign(new Error('stripe says no'), { type }));

    expect(mapped).toBeInstanceOf(PaymentProviderUnavailableException);
    expect((mapped as PaymentProviderUnavailableException).getStatus()).toBe(503);
  });

  // These are the caller's mistake or a fact about the data, not an outage: retrying cannot help.
  it.each(['StripeInvalidRequestError', 'StripeCardError', 'StripePermissionError'])(
    'leaves a %s alone',
    type => {
      const error = Object.assign(new Error('bad request'), { type });

      expect(mapProviderFailure(error)).toBe(error);
    }
  );

  it.each([new Error('plain'), 'a string', null, undefined, { type: 42 }])(
    'leaves %p alone',
    error => {
      expect(mapProviderFailure(error)).toBe(error);
    }
  );
});
