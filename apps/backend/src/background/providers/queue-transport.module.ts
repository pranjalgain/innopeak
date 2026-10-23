import { QUEUE_JOB_OPTIONS, QUEUE_LIST, QueueName } from '@bg/constants/job.constant';
import { BullMqQueuePublisher } from '@bg/providers/bullmq-queue.publisher';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import { SqsQueuePublisher } from '@bg/providers/sqs-queue.publisher';
import { isAwsDeploymentTarget } from '@config/deployment-target.util';
import { EnvConfig } from '@config/env.config';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisModule } from '@redis/redis.module';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

const isAws = isAwsDeploymentTarget();

const queuePublisherProvider: Provider = isAws
  ? {
      provide: QueuePublisherProvider,
      useFactory: (configService: ConfigService<EnvConfig>, redis: Redis): QueuePublisherProvider =>
        new SqsQueuePublisher(configService, redis),
      inject: [ConfigService, REDIS_CLIENT],
    }
  : {
      provide: QueuePublisherProvider,
      useFactory: (...queues: Queue[]): QueuePublisherProvider =>
        new BullMqQueuePublisher(
          Object.fromEntries(QUEUE_LIST.map((name, index) => [name, queues[index]]))
        ),
      inject: QUEUE_LIST.map(name => getQueueToken(name)),
    };

/** Single place that binds `QueuePublisherProvider` to BullMQ or SQS, shared by the worker and API modules. */
@Module({
  // SQS publishing deduplicates job ids through Redis (a standard queue cannot), so it needs the client.
  imports: isAws
    ? [RedisModule]
    : [
        BullModule.registerQueue(
          ...QUEUE_LIST.map(name => {
            if (name === QueueName.REVIEW_SYNC) {
              return { name };
            }
            return { name, defaultJobOptions: QUEUE_JOB_OPTIONS[name] };
          })
        ),
      ],
  providers: [queuePublisherProvider],
  exports: [QueuePublisherProvider],
})
export class QueueTransportModule {}
