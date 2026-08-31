import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import type { HealthCheckResponseDto } from './dto/health-check-response.dto';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let target: HealthController;
  let healthService: { checkHealth: jest.Mock };

  const healthyResponse: HealthCheckResponseDto = {
    status: 'up',
    info: {
      google: { status: 'up' },
      database: { status: 'up' },
      redis: { status: 'up' },
      memory_heap: { status: 'up' },
    },
    details: {
      google: { status: 'up' },
      database: { status: 'up' },
      redis: { status: 'up' },
      memory_heap: { status: 'up' },
    },
  };

  beforeEach(async () => {
    healthService = { checkHealth: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    target = module.get(HealthController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('check', () => {
    it('returns a 200 success payload when the health check resolves', async () => {
      healthService.checkHealth.mockResolvedValue(healthyResponse);

      const result = await target.check();

      expect(result).toEqual({
        statusCode: 200,
        status: 'Success',
        message: 'Health check completed',
        data: healthyResponse,
      });
    });

    it('returns a 503 failure payload when the health check throws', async () => {
      healthService.checkHealth.mockRejectedValue(new Error('Unexpected failure'));

      const result = await target.check();

      expect(result).toEqual({
        statusCode: 503,
        status: 'Failure',
        message: 'Health check failed',
        error: 'Unexpected failure',
        data: null,
      });
    });

    it('returns down status data from the service without throwing when a dependency is degraded', async () => {
      const degradedResponse: HealthCheckResponseDto = {
        ...healthyResponse,
        status: 'down',
        error: 'Some services are down',
        info: { ...healthyResponse.info, redis: { status: 'down', message: 'Redis check failed' } },
      };
      healthService.checkHealth.mockResolvedValue(degradedResponse);

      const result = await target.check();

      expect(result).toEqual({
        statusCode: 200,
        status: 'Success',
        message: 'Health check completed',
        data: degradedResponse,
      });
    });
  });

  describe('showHealth', () => {
    it('returns a UI view model derived from the health check result', async () => {
      healthService.checkHealth.mockResolvedValue(healthyResponse);

      const result = await target.showHealth();

      expect(result).toEqual({
        status: 'up',
        info: healthyResponse.info,
        user: 'Developer',
      });
    });

    it('propagates down status into the view model', async () => {
      const degradedResponse: HealthCheckResponseDto = {
        ...healthyResponse,
        status: 'down',
        error: 'Some services are down',
      };
      healthService.checkHealth.mockResolvedValue(degradedResponse);

      const result = await target.showHealth();

      expect(result.status).toBe('down');
      expect(result.info).toEqual(degradedResponse.info);
      expect(result.user).toBe('Developer');
    });
  });
});
