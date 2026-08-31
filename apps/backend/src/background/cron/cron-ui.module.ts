import { QueueName } from '@bg/constants/job.constant';
import { QueueTransportModule } from '@bg/providers/queue-transport.module';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { isAwsDeploymentTarget, isProduction } from '@config/deployment-target.util';
import { CronQueueEvents } from '@cron/cron.events';
import { CronQueue } from '@cron/cron.queue';
import { CronScheduler } from '@cron/cron.scheduler';
import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Injectable, Module, Provider } from '@nestjs/common';

const isAws = isAwsDeploymentTarget();

@Injectable()
export class CronQueueConfig {
  static getQueueConfig(): DynamicModule {
    return BullModule.registerQueue({
      name: QueueName.CRON,
      streams: {
        events: {
          maxLen: 1000,
        },
      },
      defaultJobOptions: {
        attempts: 1,
        removeOnFail: true,
        removeOnComplete: {
          age: 1 * 24 * 3600, // Keep for 1 day
        },
      },
    });
  }

  static getQueueUIConfig(): DynamicModule {
    return BullBoardModule.forFeature({
      name: QueueName.CRON,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: isProduction(),
        displayName: 'CRON Queue',
        description: 'Queue for CRON jobs',
      },
    });
  }
}

const bullMqImports: DynamicModule[] = isAws
  ? []
  : [CronQueueConfig.getQueueConfig(), CronQueueConfig.getQueueUIConfig()];
const bullMqProviders: Provider[] = isAws ? [] : [CronQueueEvents];

@Module({
  imports: [QueueTransportModule, ...bullMqImports],
  providers: [...bullMqProviders, CronScheduler, CronQueue],
  exports: [CronQueue],
})
export class CronUIModule {}
