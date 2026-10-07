import { Module } from '@nestjs/common';

import { BillingReconciliationModule } from './billing-reconciliation.module';
import { BillingWebhooksController } from './controllers/billing-webhooks.controller';
import { BillingController } from './controllers/billing.controller';
import { BillingEntitlementsService } from './services/billing-entitlements.service';
import { BillingWebhooksService } from './services/billing-webhooks.service';
import { BillingService } from './services/billing.service';

/** Not `@Global()`: modules that enforce entitlements import `BillingEntitlementsService` explicitly. DB services come from the global `DBModule`. */
@Module({
  controllers: [BillingController, BillingWebhooksController],
  imports: [BillingReconciliationModule],
  providers: [BillingService, BillingWebhooksService, BillingEntitlementsService],
  exports: [BillingEntitlementsService],
})
export class BillingModule {}
