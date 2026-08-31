import type { HealthIndicatorResult } from '@nestjs/terminus';
import { MemoryHealthIndicator } from '@nestjs/terminus';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { RedisHealthIndicator } from '@redis/redis.health';

import { CustomDatabaseHealthIndicator } from './custom-database-health.indicator';
import { CustomHttpHealthIndicator } from './custom-http-health.indicator';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let target: HealthService;
  let http: { pingCheck: jest.Mock };
  let database: { isHealthy: jest.Mock };
  let memory: { checkHeap: jest.Mock };
  let redisHealth: { isHealthy: jest.Mock };

  beforeEach(async () => {
    http = { pingCheck: jest.fn() };
    database = { isHealthy: jest.fn() };
    memory = { checkHeap: jest.fn() };
    redisHealth = { isHealthy: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: CustomHttpHealthIndicator, useValue: http },
        { provide: CustomDatabaseHealthIndicator, useValue: database },
        { provide: MemoryHealthIndicator, useValue: memory },
        { provide: RedisHealthIndicator, useValue: redisHealth },
      ],
    }).compile();

    target = module.get(HealthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('checkHealth', () => {
    it('returns status up when all indicators are healthy', async () => {
      const googleResult: HealthIndicatorResult = {
        google: { status: 'up', url: 'https://google.com' },
      };
      const databaseResult: HealthIndicatorResult = { database: { status: 'up' } };
      const redisResult: HealthIndicatorResult = { redis: { status: 'up' } };
      const memoryResult: HealthIndicatorResult = { memory_heap: { status: 'up' } };

      http.pingCheck.mockResolvedValue(googleResult);
      database.isHealthy.mockResolvedValue(databaseResult);
      redisHealth.isHealthy.mockResolvedValue(redisResult);
      memory.checkHeap.mockResolvedValue(memoryResult);

      const result = await target.checkHealth();

      expect(result.status).toBe('up');
      expect(result.error).toBeUndefined();
      expect(result.info).toEqual({
        google: googleResult['google'],
        database: databaseResult['database'],
        redis: redisResult['redis'],
        memory_heap: memoryResult['memory_heap'],
      });
      expect(result.details).toEqual(result.info);

      expect(http.pingCheck).toHaveBeenCalledWith('google', 'https://google.com');
      expect(database.isHealthy).toHaveBeenCalledWith('database');
      expect(redisHealth.isHealthy).toHaveBeenCalledWith('redis');
      expect(memory.checkHeap).toHaveBeenCalledWith('memory_heap', 250 * 1024 * 1024);
    });

    it('returns status down and captures error when the HTTP check throws', async () => {
      http.pingCheck.mockRejectedValue(new Error('HTTP unreachable'));
      database.isHealthy.mockResolvedValue({ database: { status: 'up' } });
      redisHealth.isHealthy.mockResolvedValue({ redis: { status: 'up' } });
      memory.checkHeap.mockResolvedValue({ memory_heap: { status: 'up' } });

      const result = await target.checkHealth();

      expect(result.status).toBe('down');
      expect(result.error).toBe('Some services are down');
      expect(result.info.google).toEqual({
        status: 'down',
        message: 'HTTP check failed',
        error: 'HTTP unreachable',
      });
    });

    it('returns status down when the database check throws', async () => {
      http.pingCheck.mockResolvedValue({ google: { status: 'up' } });
      database.isHealthy.mockRejectedValue(new Error('DB connection refused'));
      redisHealth.isHealthy.mockResolvedValue({ redis: { status: 'up' } });
      memory.checkHeap.mockResolvedValue({ memory_heap: { status: 'up' } });

      const result = await target.checkHealth();

      expect(result.status).toBe('down');
      expect(result.info.database).toEqual({
        status: 'down',
        message: 'Database check failed',
        error: 'DB connection refused',
      });
    });

    it('returns status down when the redis check throws', async () => {
      http.pingCheck.mockResolvedValue({ google: { status: 'up' } });
      database.isHealthy.mockResolvedValue({ database: { status: 'up' } });
      redisHealth.isHealthy.mockRejectedValue(new Error('Redis timeout'));
      memory.checkHeap.mockResolvedValue({ memory_heap: { status: 'up' } });

      const result = await target.checkHealth();

      expect(result.status).toBe('down');
      expect(result.info.redis).toEqual({
        status: 'down',
        message: 'Redis check failed',
        error: 'Redis timeout',
      });
    });

    it('returns status down when the memory check throws', async () => {
      http.pingCheck.mockResolvedValue({ google: { status: 'up' } });
      database.isHealthy.mockResolvedValue({ database: { status: 'up' } });
      redisHealth.isHealthy.mockResolvedValue({ redis: { status: 'up' } });
      memory.checkHeap.mockRejectedValue(new Error('Heap exceeded'));

      const result = await target.checkHealth();

      expect(result.status).toBe('down');
      expect(result.info.memory_heap).toEqual({
        status: 'down',
        message: 'Memory check failed',
        error: 'Heap exceeded',
      });
    });

    it('falls back to a down entry via extractEntry when the indicator result is missing the expected key', async () => {
      // Simulates the theoretically-unreachable branch where HealthIndicatorResult doesn't
      // contain the requested key (guards the noUncheckedIndexedAccess fallback in extractEntry).
      http.pingCheck.mockResolvedValue({ unexpected: { status: 'up' } });
      database.isHealthy.mockResolvedValue({ database: { status: 'up' } });
      redisHealth.isHealthy.mockResolvedValue({ redis: { status: 'up' } });
      memory.checkHeap.mockResolvedValue({ memory_heap: { status: 'up' } });

      const result = await target.checkHealth();

      expect(result.info.google).toEqual({ status: 'down' });
      // The extractEntry fallback doesn't throw, so overall status stays up as no error path fired.
      expect(result.status).toBe('up');
    });
  });
});
