import { QueueName } from '@bg/constants/job.constant';
import { QueueTransportModule } from '@bg/providers/queue-transport.module';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { isAwsDeploymentTarget, isProduction } from '@config/deployment-target.util';
import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Injectable, Module, Provider } from '@nestjs/common';

import { WebhookQueueEvents } from './webhook-queue.events';
import { WebhookQueue } from './webhook.queue';

const isAws = isAwsDeploymentTarget();

@Injectable()
export class WebhookQueueConfig {
  static getQueueConfig(): DynamicModule {
    return BullModule.registerQueue({
      name: QueueName.WEBHOOK,
      streams: {
        events: {
          maxLen: 1000,
        },
      },
      defaultJobOptions: {
        removeOnFail: true,
        removeOnComplete: {
          age: 1 * 24 * 3600, // Keep for 1 day
        },
      },
    });
  }

  static getQueueUIConfig(): DynamicModule {
    return BullBoardModule.forFeature({
      name: QueueName.WEBHOOK,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: isProduction(),
        displayName: 'Webhook Delivery Queue',
        description: 'Queue for delivering outbound webhooks',
      },
    });
  }
}

const bullMqImports: DynamicModule[] = isAws
  ? []
  : [WebhookQueueConfig.getQueueConfig(), WebhookQueueConfig.getQueueUIConfig()];
const bullMqProviders: Provider[] = isAws ? [] : [WebhookQueueEvents];

@Module({
  imports: [QueueTransportModule, ...bullMqImports],
  providers: [...bullMqProviders, WebhookQueue],
  exports: [WebhookQueue],
})
export class WebhookQueueUIModule {}
