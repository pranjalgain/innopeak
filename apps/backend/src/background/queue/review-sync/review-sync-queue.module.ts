import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { Module } from '@nestjs/common';
import { ReviewSyncQueueService } from '@review-sync-queue/review-sync-queue.service';
import { ReviewSyncProcessor } from '@review-sync-queue/review-sync.processor';

/**
 * BullMQ only — unlike the email/cron/dead-letter queues, this one has no SQS consumer. Review
 * sync runs on BullMQ in every environment.
 *
 * The consumer half. ReviewProviderModule and DBModule are both @Global(), so
 * ReviewSyncQueueService's provider + repository dependencies resolve without importing them here.
 */
@Module({
  imports: [DeadLetterQueueModule],
  providers: [ReviewSyncQueueService, ReviewSyncProcessor],
})
export class ReviewSyncQueueModule {}
