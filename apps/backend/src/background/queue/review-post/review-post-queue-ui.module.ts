import { QueueName } from '@bg/constants/job.constant';
import { QueueTransportModule } from '@bg/providers/queue-transport.module';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { isAwsDeploymentTarget, isProduction } from '@config/deployment-target.util';
import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Injectable, Module } from '@nestjs/common';
import { ReviewPostQueue } from '@review-post-queue/review-post.queue';

const isAws = isAwsDeploymentTarget();

@Injectable()
export class ReviewPostQueueConfig {
  static getQueueConfig(): DynamicModule {
    return BullModule.registerQueue({
      name: QueueName.REVIEW_POST,
      streams: { events: { maxLen: 1000 } },
      defaultJobOptions: {
        // Deliberately 1, not the project default of 3 — see `ReviewPostQueueService.postResponse`'s
        // own doc comment: a blind BullMQ retry would replay a stale decision instead of re-running
        // the freshness check, so recovery is the user-triggered `retry-post` route, not a backoff.
        attempts: 1,
        removeOnFail: { age: 7 * 24 * 3600 },
        removeOnComplete: { age: 7 * 24 * 3600 },
      },
    });
  }

  static getQueueUIConfig(): DynamicModule {
    return BullBoardModule.forFeature({
      name: QueueName.REVIEW_POST,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: isProduction(),
        displayName: 'Review Post Queue',
        description: 'Queue for posting approved replies back to Google Business Profile',
      },
    });
  }
}

// Same split as `EmailQueueUIModule`/`ReviewSyncQueueUIModule`: BullMQ registration and its Bull
// Board panel only apply in 'local' mode — in 'aws' mode, jobs go through SQS (see
// ReviewPostSqsConsumer) and dashboard parity comes from the dev-tools SQS panel instead.
const bullMqImports: DynamicModule[] = isAws
  ? []
  : [ReviewPostQueueConfig.getQueueConfig(), ReviewPostQueueConfig.getQueueUIConfig()];

/**
 * The **producer half** — both the API (`ReviewsService` enqueueing after an approve/manual-reply/
 * retry-post/manual-post) and the worker (none today, but kept available the same way
 * `ReviewSyncQueueProducerModule` is) safely import this; `ReviewPostQueueModule` carries the
 * `@Processor`/consumer and is worker-only.
 */
@Module({
  imports: [QueueTransportModule, ...bullMqImports],
  providers: [ReviewPostQueue],
  exports: [ReviewPostQueue],
})
export class ReviewPostQueueUIModule {}
