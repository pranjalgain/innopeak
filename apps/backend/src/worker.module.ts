// Note: All the common services/modules used by workers
// should be imported here
import { BackgroundModule } from '@bg/background.module';
import { DEFAULT_JOB_OPTIONS, QueuePrefix } from '@bg/constants/job.constant';
import { EnvConfigModule } from '@config/env-config.module';
import { DBModule } from '@db/db.module';
import { LoggerModule } from '@logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RedisModule } from '@redis/redis.module';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { ReviewProviderModule } from '@review-provider/review-provider.module';
import Redis from 'ioredis';

// Queue module
const queueModule = BullModule.forRootAsync({
  imports: [RedisModule],
  useFactory: (redisClient: Redis) => {
    return {
      prefix: QueuePrefix.SYSTEM, // For grouping queues
      connection: redisClient.options,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    };
  },
  inject: [REDIS_CLIENT],
});

// DBModule is @Global, so importing it once here is what lets CronService (AUTH_TOKEN_CLEANUP)
// inject AuthDbService inside the worker process. ReviewProviderModule is here for the same
// reason: the review backfill runs in *this* process and needs the Google client and the
// credential store, neither of which it could reach through an API module.
@Module({
  imports: [
    EnvConfigModule,
    LoggerModule,
    RedisModule,
    DBModule,
    ReviewProviderModule,
    queueModule,
    BackgroundModule,
  ],
})
export class WorkerModule {}
