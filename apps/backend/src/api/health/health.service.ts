import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, MemoryHealthIndicator } from '@nestjs/terminus';
import { RedisHealthIndicator } from '@redis/redis.health';

import { CustomDatabaseHealthIndicator } from './custom-database-health.indicator';
import { CustomHttpHealthIndicator } from './custom-http-health.indicator';
import { HealthCheckResponseDto } from './dto/health-check-response.dto';
import { HealthCheckResultsDto } from './dto/health-check-results.dto';
import { HealthEntryDto } from './dto/health-entry.dto';

/**
 * Every indicator builds its result via `HealthIndicator.getStatus(key, ...)`, which always
 * populates `result[key]`. The index signature on `HealthIndicatorResult` can't express that
 * guarantee statically under `noUncheckedIndexedAccess`, so we fall back to an explicit "down"
 * entry here — this branch should be unreachable in practice.
 */
function extractEntry(result: HealthIndicatorResult, key: string): HealthEntryDto {
  const entry = result[key];
  return entry ?? { status: 'down' };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly http: CustomHttpHealthIndicator,
    private readonly database: CustomDatabaseHealthIndicator,
    // private readonly disk: DiskHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator
  ) {}

  async checkHealth(): Promise<HealthCheckResponseDto> {
    const results = {} as HealthCheckResultsDto;
    let overallStatus: 'down' | 'up' = 'up';

    // HTTP check
    try {
      const httpResult = await this.http.pingCheck('google', 'https://google.com');
      results.google = extractEntry(httpResult, 'google');
    } catch (error) {
      results.google = {
        status: 'down',
        message: 'HTTP check failed',
        error: (error as Error).message,
      };
      overallStatus = 'down';
    }

    // Database check
    try {
      const dbResult = await this.database.isHealthy('database');
      results.database = extractEntry(dbResult, 'database');
    } catch (error) {
      results.database = {
        status: 'down',
        message: 'Database check failed',
        error: (error as Error).message,
      };
      overallStatus = 'down';
    }

    // Redis check
    try {
      const redisResult = await this.redisHealth.isHealthy('redis');
      results.redis = extractEntry(redisResult, 'redis');
    } catch (error) {
      results.redis = {
        status: 'down',
        message: 'Redis check failed',
        error: (error as Error).message,
      };
      overallStatus = 'down';
    }

    // Memory check
    try {
      const memoryResult = await this.memory.checkHeap('memory_heap', 250 * 1024 * 1024);
      results.memory_heap = extractEntry(memoryResult, 'memory_heap');
    } catch (error) {
      results.memory_heap = {
        status: 'down',
        message: 'Memory check failed',
        error: (error as Error).message,
      };
      overallStatus = 'down';
    }

    return {
      status: overallStatus,
      info: results,
      error: overallStatus === 'down' ? 'Some services are down' : undefined,
      details: results,
    };
  }
}
