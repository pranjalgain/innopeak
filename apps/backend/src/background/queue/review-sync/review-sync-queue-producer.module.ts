import { QueueName } from '@bg/constants/job.constant';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ReviewSyncQueue } from '@review-sync-queue/review-sync.queue';

// Retained longer than the email queue: "did this backfill run" is a support question asked days later.
const reviewSyncQueueBullModule = BullModule.registerQueue({
  name: QueueName.REVIEW_SYNC,
  streams: { events: { maxLen: 1000 } },
  defaultJobOptions: {
    removeOnFail: { age: 7 * 24 * 3600 },
    removeOnComplete: { age: 7 * 24 * 3600 },
  },
});

/**
 * Producer half only, imported by both the API (via `ReviewSyncQueueUIModule`) and the worker.
 *
 * The split is load-bearing: NestJS turns any `@Processor` provider in a graph into a live BullMQ
 * worker, so `ReviewSyncProcessor` must stay in `ReviewSyncQueueModule` (worker-only) or the API
 * process starts consuming review-sync jobs itself.
 */
@Module({
  imports: [reviewSyncQueueBullModule],
  providers: [ReviewSyncQueue],
  exports: [reviewSyncQueueBullModule, ReviewSyncQueue],
})
export class ReviewSyncQueueProducerModule {}
