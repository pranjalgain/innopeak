import { MESSAGES } from '@common/constants/messages.constants';
import { ServiceUnavailableException } from '@nestjs/common';

/**
 * The payment provider (Stripe) could not be reached or answered with a server-side fault. Distinct from
 * `PAYMENT_NOT_CONFIGURED`: this one is transient and worth retrying, which the 503 tells every client.
 */
export class PaymentProviderUnavailableException extends ServiceUnavailableException {
  constructor(message: string = MESSAGES.BILLING.PAYMENT_PROVIDER_UNAVAILABLE) {
    super({ message, code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
  }
}
