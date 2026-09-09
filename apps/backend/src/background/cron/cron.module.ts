import { isAwsDeploymentTarget } from '@config/deployment-target.util';
import { CronSqsConsumer } from '@cron/cron-sqs.consumer';
import { CronProcessor } from '@cron/cron.processor';
import { CronService } from '@cron/cron.service';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { Module, Provider } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReviewSyncQueueProducerModule } from '@review-sync-queue/review-sync-queue-producer.module';

const isAws = isAwsDeploymentTarget();
const consumerProvider: Provider = isAws ? CronSqsConsumer : CronProcessor;

/**
 * `ReviewSyncQueueProducerModule` — the producer half, deliberately not the whole
 * `ReviewSyncQueueModule` — is imported for `CronService`'s `ReviewSyncQueue` dependency.
 * `pollDueLocations` is the first cron job in this codebase whose work is "publish more jobs"
 * rather than doing its work inline, so `CronService` needed a producer for the first time;
 * importing the consumer module here would additionally start a second review-sync `@Processor`
 * wherever this module is loaded. `ConnectionsDbService` (`CronService`'s other new dependency)
 * needs no import: `DBModule` is `@Global()`.
 */
@Module({
  imports: [ScheduleModule.forRoot(), DeadLetterQueueModule, ReviewSyncQueueProducerModule],
  providers: [consumerProvider, CronService],
})
export class CronModule {}
