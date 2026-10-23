import { QUEUE_JOB_OPTIONS, QueueName } from '@bg/constants/job.constant';
import { QueueTransportModule } from '@bg/providers/queue-transport.module';
import { isAwsDeploymentTarget } from '@config/deployment-target.util';
import { DeadLetterQueueEvents } from '@dead-letter-queue/dead-letter-queue.events';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { DeadLetterSqsConsumer } from '@dead-letter-queue/dead-letter-sqs.consumer';
import { DeadLetterProcessor } from '@dead-letter-queue/dead-letter.processor';
import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Module, Provider } from '@nestjs/common';

const isAws = isAwsDeploymentTarget();

const bullMqImports: DynamicModule[] = isAws
  ? []
  : [
      BullModule.registerQueue({
        name: QueueName.DEAD_LETTER,
        streams: {
          events: {
            maxLen: 1000,
          },
        },
        defaultJobOptions: QUEUE_JOB_OPTIONS[QueueName.DEAD_LETTER],
      }),
    ];
const consumerProvider: Provider = isAws ? DeadLetterSqsConsumer : DeadLetterProcessor;
const bullMqProviders: Provider[] = isAws ? [] : [DeadLetterQueueEvents];

@Module({
  imports: [QueueTransportModule, ...bullMqImports],
  providers: [DeadLetterQueueService, consumerProvider, ...bullMqProviders],
  exports: [DeadLetterQueueService],
})
export class DeadLetterQueueModule {}
