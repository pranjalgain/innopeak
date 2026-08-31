import { DBModule } from '@db/db.module';
import { HealthController } from '@health/health.controller';
import { HealthService } from '@health/health.service';
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { RedisModule } from '@redis/redis.module';

import { CustomDatabaseHealthIndicator } from './custom-database-health.indicator';
import { CustomHttpHealthIndicator } from './custom-http-health.indicator';

@Module({
  imports: [TerminusModule, DBModule, RedisModule],
  controllers: [HealthController],
  providers: [HealthService, CustomHttpHealthIndicator, CustomDatabaseHealthIndicator],
  exports: [HealthService],
})
export class HealthModule {}
