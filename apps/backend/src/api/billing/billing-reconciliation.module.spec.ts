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

// The worker process loads this module without `BillingModule`; fails if it grows a dependency only
// `BillingModule` provides.
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
