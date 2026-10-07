import type { EnvConfig } from '@config/env.config';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DummyPaymentProvider } from './providers/dummy-payment.provider';
import { PaymentProvider } from './providers/payment.provider';
import { StripePaymentProvider } from './providers/stripe-payment.provider';
import { BillingReconciliationService } from './services/billing-reconciliation.service';
import type { PaymentProviderType } from './types/billing.type';

const logger = new Logger('BillingReconciliationModule');

/** Defaults to `dummy`: real Stripe traffic before real keys/webhook secrets exist is harmful. */
export const paymentProviderFactory = {
  provide: PaymentProvider,
  useFactory: (configService: ConfigService<EnvConfig>): PaymentProvider => {
    const providerType =
      (configService.get<string>('PAYMENT_PROVIDER') as PaymentProviderType | undefined) ?? 'dummy';

    logger.log(`Initializing payment provider: ${providerType}`);

    switch (providerType) {
      case 'stripe':
        return new StripePaymentProvider(configService);
      case 'dummy':
      default:
        return new DummyPaymentProvider(configService);
    }
  },
  inject: [ConfigService],
};

/**
 * Split out of `BillingModule` so the worker (`CronModule`) can reach `BillingReconciliationService`
 * without instantiating the controllers and webhook handler. `BillingModule` imports this too, so
 * there is one `PaymentProvider` per process.
 */
@Module({
  providers: [paymentProviderFactory, BillingReconciliationService],
  exports: [PaymentProvider, BillingReconciliationService],
})
export class BillingReconciliationModule {}
