import { AuthModule } from '@auth/auth.module';
import { BillingReconciliationModule } from '@billing/billing-reconciliation.module';
import { isAwsDeploymentTarget } from '@config/deployment-target.util';
import { CronSqsConsumer } from '@cron/cron-sqs.consumer';
import { CronProcessor } from '@cron/cron.processor';
import { CronService } from '@cron/cron.service';
import { TenantErasureCleanupService } from '@cron/tenant-erasure-cleanup.service';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { Module, Provider } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReviewSyncQueueProducerModule } from '@review-sync-queue/review-sync-queue-producer.module';

const isAws = isAwsDeploymentTarget();
const consumerProvider: Provider = isAws ? CronSqsConsumer : CronProcessor;

// Only the producer half of the review-sync queue: importing the consumer module would start a
// second review-sync `@Processor` wherever this module loads. `AuthModule` supplies
// `AccountAnonymizationService` for the erasure purge; `BillingReconciliationModule` (not the whole
// `BillingModule`, whose controllers the worker has no use for) supplies the reconciliation sweep.
@Module({
  imports: [
    ScheduleModule.forRoot(),
    DeadLetterQueueModule,
    ReviewSyncQueueProducerModule,
    AuthModule,
    BillingReconciliationModule,
  ],
  providers: [consumerProvider, CronService, TenantErasureCleanupService],
})
export class CronModule {}
