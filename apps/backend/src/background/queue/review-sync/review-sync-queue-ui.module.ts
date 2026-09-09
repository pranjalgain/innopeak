import { QueueName } from '@bg/constants/job.constant';
import { QueueTransportModule } from '@bg/providers/queue-transport.module';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { isProduction } from '@config/deployment-target.util';
import { Module } from '@nestjs/common';
import { ReviewSyncQueueProducerModule } from '@review-sync-queue/review-sync-queue-producer.module';
import { ReviewSyncQueueEvents } from '@review-sync-queue/review-sync-queue.events';

const reviewSyncQueueUIConfig = BullBoardModule.forFeature({
  name: QueueName.REVIEW_SYNC,
  adapter: BullMQAdapter,
  options: {
    readOnlyMode: isProduction(),
    displayName: 'Review Sync Queue',
    description: 'Historical review backfill and scheduled review polling',
  },
});

/**
 * Unconditionally registered, with no `isAws` branch — this queue is BullMQ in every environment
 * (see ReviewSyncQueueModule), so its Bull Board panel is always the right place to inspect it.
 *
 * API-only, and only additive: the Bull Board panel and its events listener on top of
 * `ReviewSyncQueueProducerModule`, which owns the queue registration and the producer. Re-exported
 * so this module's own importers (`ConnectionsModule`) keep resolving `ReviewSyncQueue` unchanged.
 * Deliberately does **not** reach `ReviewSyncQueueModule` — that one carries the `@Processor`, and
 * pulling it into the API graph would start a second review-sync worker inside the HTTP process.
 */
@Module({
  imports: [QueueTransportModule, ReviewSyncQueueProducerModule, reviewSyncQueueUIConfig],
  providers: [ReviewSyncQueueEvents],
  exports: [ReviewSyncQueueProducerModule],
})
export class ReviewSyncQueueUIModule {}
