import { QueueName } from '@bg/constants/job.constant';
import { QueueTransportModule } from '@bg/providers/queue-transport.module';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { isLocalDevelopment } from '@config/deployment-target.util';
import { Module } from '@nestjs/common';
import { ReviewSyncQueueProducerModule } from '@review-sync-queue/review-sync-queue-producer.module';
import { ReviewSyncQueueEvents } from '@review-sync-queue/review-sync-queue.events';

const reviewSyncQueueUIConfig = BullBoardModule.forFeature({
  name: QueueName.REVIEW_SYNC,
  adapter: BullMQAdapter,
  options: {
    readOnlyMode: !isLocalDevelopment(),
    displayName: 'Review Sync Queue',
    description: 'Historical review backfill and scheduled review polling',
  },
});

/**
 * API-only; no `isAws` branch since this queue is BullMQ everywhere. Deliberately does not import
 * `ReviewSyncQueueModule`: its `@Processor` would start a review-sync worker inside the HTTP process.
 */
@Module({
  imports: [QueueTransportModule, ReviewSyncQueueProducerModule, reviewSyncQueueUIConfig],
  providers: [ReviewSyncQueueEvents],
  exports: [ReviewSyncQueueProducerModule],
})
export class ReviewSyncQueueUIModule {}
