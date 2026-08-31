import { QueueName } from '@bg/constants/job.constant';
import { QueueTransportModule } from '@bg/providers/queue-transport.module';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { isAwsDeploymentTarget, isProduction } from '@config/deployment-target.util';
import { EmailQueueEvents } from '@email-queue/email-queue.events';
import { EmailQueue } from '@email-queue/email.queue';
import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Injectable, Module, Provider } from '@nestjs/common';

const isAws = isAwsDeploymentTarget();

@Injectable()
export class EmailQueueConfig {
  static getQueueConfig(): DynamicModule {
    return BullModule.registerQueue({
      name: QueueName.EMAIL,
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
      name: QueueName.EMAIL,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: isProduction(),
        displayName: 'Email Queue',
        description: 'Queue for sending emails',
      },
    });
  }
}

// BullMQ registration, its Bull Board UI feature, and the raw queue-event listener only apply in
// 'local' mode — in 'aws' mode, email jobs go through SQS (see EmailSqsConsumer); dashboard parity
// comes from the dev-tools SQS panel instead of Bull Board.
const bullMqImports: DynamicModule[] = isAws
  ? []
  : [EmailQueueConfig.getQueueConfig(), EmailQueueConfig.getQueueUIConfig()];
const bullMqProviders: Provider[] = isAws ? [] : [EmailQueueEvents];

@Module({
  imports: [QueueTransportModule, ...bullMqImports],
  providers: [...bullMqProviders, EmailQueue],
  exports: [EmailQueue],
})
export class EmailQueueUIModule {}
