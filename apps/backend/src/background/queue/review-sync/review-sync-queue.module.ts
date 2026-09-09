import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { Module } from '@nestjs/common';
import { ReviewSyncQueueService } from '@review-sync-queue/review-sync-queue.service';
import { ReviewSyncProcessor } from '@review-sync-queue/review-sync.processor';

/**
 * BullMQ only — unlike the email/cron/dead-letter queues, this one has no SQS consumer. Review
 * sync runs on BullMQ in every environment.
 *
 * The **consumer half**, and worker-only for that reason: NestJS's Bull explorer turns the
 * `@Processor` in `ReviewSyncProcessor` into a live BullMQ worker wherever this module is imported,
 * so importing it from anything the API process reaches would make the API start running backfills
 * and polls itself. The producer lives in `ReviewSyncQueueProducerModule` instead, which both
 * processes may safely import — same separation `EmailQueueModule`/`EmailQueueUIModule` keep.
 *
 * No `registerQueue` here: `@Processor` binds off `BullModule.forRootAsync`'s connection on its
 * own, and only `@InjectQueue` (the producer) needs a registered queue.
 *
 * `ReviewProviderModule` and `DBModule` are both `@Global()`, so `ReviewSyncQueueService`'s
 * provider + repository dependencies resolve without importing them here.
 */
@Module({
  imports: [DeadLetterQueueModule],
  providers: [ReviewSyncQueueService, ReviewSyncProcessor],
})
export class ReviewSyncQueueModule {}
