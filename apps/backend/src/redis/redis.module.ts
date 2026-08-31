import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthIndicatorService, TerminusModule } from '@nestjs/terminus';
import { RedisHealthIndicator } from '@redis/redis.health';
import { REDIS_CLIENT, RedisProvider } from '@redis/redis.provider';
import { Redis } from 'ioredis';

@Module({
  imports: [ConfigModule, TerminusModule],
  providers: [
    RedisProvider,
    {
      provide: RedisHealthIndicator,
      useFactory: (
        redisClient: Redis,
        healthIndicatorService: HealthIndicatorService
      ): RedisHealthIndicator => new RedisHealthIndicator(redisClient, healthIndicatorService),
      inject: [REDIS_CLIENT, HealthIndicatorService],
    },
  ],
  exports: [RedisProvider, RedisHealthIndicator],
})
export class RedisModule {}
