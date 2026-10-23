import { QUEUE_JOB_OPTIONS, QueueName } from '@bg/constants/job.constant';
import { QueueTransportModule } from '@bg/providers/queue-transport.module';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { isAwsDeploymentTarget, isLocalDevelopment } from '@config/deployment-target.util';
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
      defaultJobOptions: QUEUE_JOB_OPTIONS[QueueName.REVIEW_POST],
    });
  }

  static getQueueUIConfig(): DynamicModule {
    return BullBoardModule.forFeature({
      name: QueueName.REVIEW_POST,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: !isLocalDevelopment(),
        displayName: 'Review Post Queue',
        description: 'Queue for posting approved replies back to Google Business Profile',
      },
    });
  }
}

// BullMQ registration and Bull Board only apply in 'local' mode; in 'aws' mode jobs go through SQS.
const bullMqImports: DynamicModule[] = isAws
  ? []
  : [ReviewPostQueueConfig.getQueueConfig(), ReviewPostQueueConfig.getQueueUIConfig()];

/**
 * Producer half: safe for both the API and the worker to import. `ReviewPostQueueModule` carries
 * the `@Processor` and is worker-only.
 */
@Module({
  imports: [QueueTransportModule, ...bullMqImports],
  providers: [ReviewPostQueue],
  exports: [ReviewPostQueue],
})
export class ReviewPostQueueUIModule {}
