import { QueueTransportModule } from '@bg/providers/queue-transport.module';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
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
  // QueueTransportModule + AddingJobsToQueueManager: the paused-locations email. Not QueueUIModule, which would mount
  // the Bull Board UI in the worker too (this module is also loaded there, through AiModule).
  imports: [BillingReconciliationModule, QueueTransportModule],
  providers: [
    BillingService,
    BillingWebhooksService,
    BillingEntitlementsService,
    AddingJobsToQueueManager,
  ],
  exports: [BillingEntitlementsService],
})
export class BillingModule {}
