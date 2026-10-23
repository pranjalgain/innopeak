import type { HealthIndicatorResult } from '@nestjs/terminus';
import { MemoryHealthIndicator } from '@nestjs/terminus';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { RedisHealthIndicator } from '@redis/redis.health';

import { getHeapStatistics } from 'node:v8';

import { CustomDatabaseHealthIndicator } from './custom-database-health.indicator';
import { HEALTH_CHECK_TIMEOUT_MS, HealthService } from './health.service';

describe('HealthService', () => {
  let target: HealthService;
  let database: { isHealthy: jest.Mock };
  let memory: { checkHeap: jest.Mock };
  let redisHealth: { isHealthy: jest.Mock };

  const up = (key: string): HealthIndicatorResult => ({ [key]: { status: 'up' } });

  beforeEach(async () => {
    database = { isHealthy: jest.fn().mockResolvedValue(up('database')) };
    memory = { checkHeap: jest.fn().mockResolvedValue(up('memory_heap')) };
    redisHealth = { isHealthy: jest.fn().mockResolvedValue(up('redis')) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: CustomDatabaseHealthIndicator, useValue: database },
        { provide: MemoryHealthIndicator, useValue: memory },
        { provide: RedisHealthIndicator, useValue: redisHealth },
      ],
    }).compile();

    target = module.get(HealthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('checkLiveness', () => {
    it('reports up without touching any dependency', () => {
      expect(target.checkLiveness()).toEqual({ status: 'up' });
      expect(database.isHealthy).not.toHaveBeenCalled();
      expect(redisHealth.isHealthy).not.toHaveBeenCalled();
    });
  });

  describe('checkHealth', () => {
    it('returns status up when the required components are healthy', async () => {
      const result = await target.checkHealth();

      expect(result.status).toBe('up');
      expect(result.error).toBeUndefined();
      expect(result.info).toEqual({
        database: { status: 'up' },
        redis: { status: 'up' },
        memory_heap: { status: 'up' },
      });
      expect(result.details).toEqual(result.info);
    });

    // The probe is public and unthrottled; each real check is two round trips, so a loop against it cost that per request.
    it('answers repeated and concurrent probes from one check, then checks again once the answer is stale', async () => {
      jest.useFakeTimers();
      try {
        await Promise.all([target.checkHealth(), target.checkHealth(), target.checkHealth()]);
        await target.checkHealth();
        expect(database.isHealthy).toHaveBeenCalledTimes(1);
        expect(redisHealth.isHealthy).toHaveBeenCalledTimes(1);

        jest.setSystemTime(Date.now() + 2_001);
        await target.checkHealth();
        expect(database.isHealthy).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    // Regression: the probe pinged google.com, so a Google outage (or a blocked egress) failed readiness.
    it('does not probe any third party', async () => {
      const result = await target.checkHealth();

      expect(Object.keys(result.info).sort()).toEqual(['database', 'memory_heap', 'redis']);
    });

    // Regression: a flat 250 MB threshold marked a busy but healthy process as down.
    it('measures the heap against a share of the real V8 limit', async () => {
      await target.checkHealth();

      expect(memory.checkHeap).toHaveBeenCalledWith(
        'memory_heap',
        getHeapStatistics().heap_size_limit * 0.9
      );
    });

    it.each([
      ['database', () => database.isHealthy],
      ['redis', () => redisHealth.isHealthy],
      ['memory_heap', () => memory.checkHeap],
    ] as const)('returns status down when the %s check throws', async (key, mock) => {
      mock().mockRejectedValue(new Error('boom'));

      const result = await target.checkHealth();

      expect(result.status).toBe('down');
      expect(result.error).toBe('Some services are down');
      expect(result.info[key]?.status).toBe('down');
    });

    it('returns status down when an indicator reports itself down', async () => {
      database.isHealthy.mockResolvedValue({
        database: { status: 'down', message: 'Database health check failed' },
      });

      const result = await target.checkHealth();

      expect(result.status).toBe('down');
      expect(result.info.database).toEqual({
        status: 'down',
        message: 'Database health check failed',
      });
    });

    // The probe is public: a driver error can carry a host name or a user name.
    it('never puts the underlying error text in the public result', async () => {
      database.isHealthy.mockResolvedValue({
        database: {
          status: 'down',
          message: 'Database connection failed',
          error: 'connect ECONNREFUSED 10.0.3.7:5432 (user app_rw)',
        },
      });
      redisHealth.isHealthy.mockRejectedValue(new Error('NOAUTH at 10.0.3.9:6379'));

      const result = await target.checkHealth();

      expect(JSON.stringify(result)).not.toMatch(/10\.0\.3|app_rw|NOAUTH|ECONNREFUSED/);
    });

    // Regression: with Redis down the ping never resolved, so the readiness probe itself hung instead of answering 503.
    it('reports a check that never answers as down, without hanging the probe', async () => {
      jest.useFakeTimers();
      redisHealth.isHealthy.mockReturnValue(new Promise(() => undefined));

      const pending = target.checkHealth();
      await jest.advanceTimersByTimeAsync(HEALTH_CHECK_TIMEOUT_MS);
      const result = await pending;
      jest.useRealTimers();

      expect(result.status).toBe('down');
      expect(result.info.redis).toEqual({ status: 'down', message: 'Redis check failed' });
      expect(result.info.database?.status).toBe('up');
    });

    it('falls back to a down entry when the indicator result is missing the expected key', async () => {
      redisHealth.isHealthy.mockResolvedValue({});

      const result = await target.checkHealth();

      expect(result.status).toBe('down');
      expect(result.info.redis).toEqual({ status: 'down' });
    });
  });
});
