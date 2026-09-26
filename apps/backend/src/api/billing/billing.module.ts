import type { EnvConfig } from '@config/env.config';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BillingWebhooksController } from './controllers/billing-webhooks.controller';
import { BillingController } from './controllers/billing.controller';
// NOTE: none of the repositories/DB services this module needs are imported here — `DBModule` is
// `@Global()` and provides all of them (`BillingPlansDbService`, `TenantSubscriptionsDbService`,
// `StripeWebhookEventsDbService`, `BillingReceiptsDbService`, `ConnectionsDbService`,
// `AuthDbService`, `ReviewSyncDbService`, `PlatformSettingsDbService`).
import { DummyPaymentProvider } from './providers/dummy-payment.provider';
import { PaymentProvider } from './providers/payment.provider';
import { StripePaymentProvider } from './providers/stripe-payment.provider';
import { BillingEntitlementsService } from './services/billing-entitlements.service';
import { BillingWebhooksService } from './services/billing-webhooks.service';
import { BillingService } from './services/billing.service';
import type { PaymentProviderType } from './types/billing.type';

const logger = new Logger('BillingModule');

/** Same DI-swap shape as `MediaModule`'s own `storageProviderFactory` — see that file's doc
 *  comment for why the selection lives in a module-scoped factory rather than a separate
 *  top-level module. Defaults to `dummy`, unlike `STORAGE_PROVIDER` defaulting to `noop` for a
 *  different reason: shipping real, unwanted Stripe traffic before real keys/webhook secrets exist
 *  is actively harmful, whereas Dummy is a fully working simulated flow on its own. */
const paymentProviderFactory = {
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
 * Not `@Global()` — `BillingEntitlementsService` is real business logic, imported explicitly by
 * whichever modules need it for enforcement (`ConnectionsModule`, `PromptsModule`, `SettingsModule`
 * for `TenantMembersService`), the same way `AuthModule` imports `MediaModule`. `PaymentProvider`
 * stays private to this module: nothing outside `BillingService`/`BillingWebhooksController` talks
 * to a payment provider directly.
 */
@Module({
  controllers: [BillingController, BillingWebhooksController],
  providers: [
    paymentProviderFactory,
    BillingService,
    BillingWebhooksService,
    BillingEntitlementsService,
  ],
  exports: [BillingEntitlementsService],
})
export class BillingModule {}
