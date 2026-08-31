import { QueueName } from '@bg/constants/job.constant';
import { QueueTransportModule } from '@bg/providers/queue-transport.module';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { isAwsDeploymentTarget, isProduction } from '@config/deployment-target.util';
import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Injectable, Module, Provider } from '@nestjs/common';
import { NotificationQueueEvents } from '@notification-queue/notification-queue.events';
import { NotificationQueue } from '@notification-queue/notification.queue';

const isAws = isAwsDeploymentTarget();

@Injectable()
export class NotificationQueueConfig {
  static getQueueConfig(): DynamicModule {
    return BullModule.registerQueue({
      name: QueueName.NOTIFICATION,
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
      name: QueueName.NOTIFICATION,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: isProduction(),
        displayName: 'Notifications Queue',
        description: 'Queue for sending notifications',
      },
    });
  }
}

const bullMqImports: DynamicModule[] = isAws
  ? []
  : [NotificationQueueConfig.getQueueConfig(), NotificationQueueConfig.getQueueUIConfig()];
const bullMqProviders: Provider[] = isAws ? [] : [NotificationQueueEvents];

@Module({
  imports: [QueueTransportModule, ...bullMqImports],
  providers: [...bullMqProviders, NotificationQueue],
  exports: [NotificationQueue],
})
export class NotificationQueueUIModule {}
