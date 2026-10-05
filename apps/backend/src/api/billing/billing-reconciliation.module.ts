import type { EnvConfig } from '@config/env.config';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DummyPaymentProvider } from './providers/dummy-payment.provider';
import { PaymentProvider } from './providers/payment.provider';
import { StripePaymentProvider } from './providers/stripe-payment.provider';
import { BillingReconciliationService } from './services/billing-reconciliation.service';
import type { PaymentProviderType } from './types/billing.type';

const logger = new Logger('BillingReconciliationModule');

/** Same DI-swap shape as `MediaModule`'s own `storageProviderFactory` — see that file's doc
 *  comment for why the selection lives in a module-scoped factory rather than a separate
 *  top-level module. Defaults to `dummy`, unlike `STORAGE_PROVIDER` defaulting to `noop` for a
 *  different reason: shipping real, unwanted Stripe traffic before real keys/webhook secrets exist
 *  is actively harmful, whereas Dummy is a fully working simulated flow on its own. */
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
 * The payment provider plus the one service that only needs it and the DB layer — split out of
 * `BillingModule` so the worker process (`CronModule`'s nightly reconciliation sweep) can reach
 * `BillingReconciliationService` without also instantiating `BillingModule`'s controllers,
 * checkout/portal service and webhook handler. `BillingModule` imports this too, so there is still
 * exactly one `PaymentProvider` instance per process.
 */
@Module({
  providers: [paymentProviderFactory, BillingReconciliationService],
  exports: [PaymentProvider, BillingReconciliationService],
})
export class BillingReconciliationModule {}
