import { QUEUE_LIST } from '@bg/constants/job.constant';
import { BullMqQueuePublisher } from '@bg/providers/bullmq-queue.publisher';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import { SqsQueuePublisher } from '@bg/providers/sqs-queue.publisher';
import { isAwsDeploymentTarget } from '@config/deployment-target.util';
import { EnvConfig } from '@config/env.config';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

const isAws = isAwsDeploymentTarget();

const queuePublisherProvider: Provider = isAws
  ? {
      provide: QueuePublisherProvider,
      useFactory: (configService: ConfigService<EnvConfig>): QueuePublisherProvider =>
        new SqsQueuePublisher(configService),
      inject: [ConfigService],
    }
  : {
      provide: QueuePublisherProvider,
      useFactory: (...queues: Queue[]): QueuePublisherProvider =>
        new BullMqQueuePublisher(
          Object.fromEntries(QUEUE_LIST.map((name, index) => [name, queues[index]]))
        ),
      inject: QUEUE_LIST.map(name => getQueueToken(name)),
    };

/**
 * Provides `QueuePublisherProvider`, bound to BullMQ (local) or SQS (aws) based on
 * DEPLOYMENT_TARGET — imported by both `BackgroundModule` (worker) and `QueueUIModule` (API) so
 * the factory-selection logic lives in exactly one place.
 */
@Module({
  imports: isAws ? [] : [BullModule.registerQueue(...QUEUE_LIST.map(name => ({ name })))],
  providers: [queuePublisherProvider],
  exports: [QueuePublisherProvider],
})
export class QueueTransportModule {}
