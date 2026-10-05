import { DBService } from '@db/db.service';
import { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { BillingReconciliationModule } from './billing-reconciliation.module';
import { DummyPaymentProvider } from './providers/dummy-payment.provider';
import { PaymentProvider } from './providers/payment.provider';
import { BillingReconciliationService } from './services/billing-reconciliation.service';

/** Stands in for the `@Global()` `DBModule` and the app-wide `ConfigModule` — the only things
 *  `BillingReconciliationModule` is allowed to rely on from outside itself. */
@Global()
@Module({
  providers: [
    { provide: ConfigService, useValue: { get: () => undefined } },
    { provide: DBService, useValue: {} },
    { provide: TenantSubscriptionsDbService, useValue: {} },
    { provide: ConnectionsDbService, useValue: {} },
  ],
  exports: [ConfigService, DBService, TenantSubscriptionsDbService, ConnectionsDbService],
})
class FakeGlobalModule {}

/**
 * The worker process (`CronModule`) loads this module on its own, without `BillingModule`. Unit
 * tests of `CronService` mock the reconciliation service outright, so this is the one place the
 * real dependency graph is resolved — it fails if the module ever grows a dependency that only
 * `BillingModule` (or the API process) provides.
 */
describe('BillingReconciliationModule', () => {
  it('resolves the reconciliation service and payment provider with only global dependencies', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeGlobalModule, BillingReconciliationModule],
    }).compile();

    expect(moduleRef.get(BillingReconciliationService)).toBeInstanceOf(
      BillingReconciliationService
    );
    expect(moduleRef.get(PaymentProvider)).toBeInstanceOf(DummyPaymentProvider);
  });
});
