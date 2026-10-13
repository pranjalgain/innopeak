import { withTimeout } from '@common/helpers/with-timeout';
import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorResult, MemoryHealthIndicator } from '@nestjs/terminus';
import { RedisHealthIndicator } from '@redis/redis.health';

import { getHeapStatistics } from 'node:v8';

import { CustomDatabaseHealthIndicator } from './custom-database-health.indicator';
import { HealthCheckResponseDto } from './dto/health-check-response.dto';
import { HealthCheckResultsDto } from './dto/health-check-results.dto';
import { HealthEntryDto } from './dto/health-entry.dto';

/**
 * Heap use that counts as "about to run out of memory", as a share of V8's real limit (which follows the container's memory).
 * A fixed byte threshold marked a healthy, busy process as down.
 */
const HEAP_DOWN_FRACTION = 0.9;

/** A probe must answer promptly even when a dependency will not: a hung check is a down check, not a hung request. */
export const HEALTH_CHECK_TIMEOUT_MS = 3_000;

/**
 * `getStatus` always populates `result[key]`, but the index signature cannot express that under
 * `noUncheckedIndexedAccess`; the "down" fallback should be unreachable.
 */
function extractEntry(result: HealthIndicatorResult, key: string): HealthEntryDto {
  const entry = result[key];
  return entry ?? { status: 'down' };
}

/** The probe is public, so it reports only which component is down, never why: a raw driver error can name hosts and users. */
function publicEntry(entry: HealthEntryDto): HealthEntryDto {
  const { error: _error, ...rest } = entry;
  return rest;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly database: CustomDatabaseHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator
  ) {}

  /** Liveness: the process is running and able to answer. Deliberately checks no dependency, so a database outage restarts nothing. */
  checkLiveness(): { status: 'up' } {
    return { status: 'up' };
  }

  /**
   * Readiness: can this instance serve traffic. Database and Redis are required; memory only fails near the heap limit.
   * Third parties (Google, Stripe, the LLM) are deliberately not probed: their outages must not take this instance out of rotation.
   */
  async checkHealth(): Promise<HealthCheckResponseDto> {
    const results = {} as HealthCheckResultsDto;
    const failed: string[] = [];

    const run = async (
      key: 'database' | 'memory_heap' | 'redis',
      check: () => Promise<HealthIndicatorResult>,
      failureMessage: string
    ): Promise<void> => {
      try {
        const entry = extractEntry(
          await withTimeout(check(), HEALTH_CHECK_TIMEOUT_MS, `Health check "${key}"`),
          key
        );
        if (entry.error) this.logger.error(`Health check "${key}" failed: ${entry.error}`);
        results[key] = publicEntry(entry);
        if (entry.status === 'down') failed.push(key);
      } catch (error) {
        this.logger.error(
          `Health check "${key}" threw: ${error instanceof Error ? error.message : String(error)}`
        );
        results[key] = { status: 'down', message: failureMessage };
        failed.push(key);
      }
    };

    await Promise.all([
      run('database', () => this.database.isHealthy('database'), 'Database check failed'),
      run('redis', () => this.redisHealth.isHealthy('redis'), 'Redis check failed'),
      run(
        'memory_heap',
        () =>
          this.memory.checkHeap(
            'memory_heap',
            getHeapStatistics().heap_size_limit * HEAP_DOWN_FRACTION
          ),
        'Memory check failed'
      ),
    ]);

    const overallStatus = failed.length > 0 ? 'down' : 'up';

    return {
      status: overallStatus,
      info: results,
      error: overallStatus === 'down' ? 'Some services are down' : undefined,
      details: results,
    };
  }
}
