import { QueueName } from '@bg/constants/job.constant';
import { QueueTransportModule } from '@bg/providers/queue-transport.module';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { isProduction } from '@config/deployment-target.util';
import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Injectable, Module } from '@nestjs/common';
import { ReviewSyncQueueEvents } from '@review-sync-queue/review-sync-queue.events';
import { ReviewSyncQueue } from '@review-sync-queue/review-sync.queue';

@Injectable()
export class ReviewSyncQueueConfig {
  static getQueueConfig(): DynamicModule {
    return BullModule.registerQueue({
      name: QueueName.REVIEW_SYNC,
      streams: { events: { maxLen: 1000 } },
      defaultJobOptions: {
        // Kept longer than the email queue's: "did this tenant's backfill actually run, and what
        // did it do" is a support question that gets asked days later, and the Bull Board record
        // is the fastest answer that isn't a database query.
        removeOnFail: { age: 7 * 24 * 3600 },
        removeOnComplete: { age: 7 * 24 * 3600 },
      },
    });
  }

  static getQueueUIConfig(): DynamicModule {
    return BullBoardModule.forFeature({
      name: QueueName.REVIEW_SYNC,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: isProduction(),
        displayName: 'Review Sync Queue',
        description: 'Historical review backfill and scheduled review polling',
      },
    });
  }
}

/**
 * Unconditionally registered, with no `isAws` branch — this queue is BullMQ in every environment
 * (see ReviewSyncQueueModule), so its Bull Board panel is always the right place to inspect it.
 */
@Module({
  imports: [
    QueueTransportModule,
    ReviewSyncQueueConfig.getQueueConfig(),
    ReviewSyncQueueConfig.getQueueUIConfig(),
  ],
  providers: [ReviewSyncQueueEvents, ReviewSyncQueue],
  exports: [ReviewSyncQueue],
})
export class ReviewSyncQueueUIModule {}
