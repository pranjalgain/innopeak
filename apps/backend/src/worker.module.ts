import { BackgroundModule } from '@bg/background.module';
import { DEFAULT_JOB_OPTIONS, QueuePrefix } from '@bg/constants/job.constant';
import { EnvConfigModule } from '@config/env-config.module';
import { DBModule } from '@db/db.module';
import { LoggerModule } from '@logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RedisModule } from '@redis/redis.module';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { ReviewPipelineModule } from '@review-pipeline/review-pipeline.module';
import { ReviewProviderModule } from '@review-provider/review-provider.module';
import Redis from 'ioredis';

import { InAppNotificationsModule } from './api/notifications/in-app-notifications.module';

const queueModule = BullModule.forRootAsync({
  imports: [RedisModule],
  useFactory: (redisClient: Redis) => {
    return {
      prefix: QueuePrefix.SYSTEM,
      connection: redisClient.options,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    };
  },
  inject: [REDIS_CLIENT],
});

// DBModule, ReviewProviderModule, ReviewPipelineModule and InAppNotificationsModule are global and must be imported here:
// CronService, the review backfill and the post/sync jobs run in this process and can't reach them through an API module.
@Module({
  imports: [
    EnvConfigModule,
    LoggerModule,
    RedisModule,
    DBModule,
    ReviewProviderModule,
    ReviewPipelineModule,
    InAppNotificationsModule,
    queueModule,
    BackgroundModule,
  ],
})
export class WorkerModule {}
