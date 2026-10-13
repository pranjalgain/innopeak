import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import type { HealthCheckResponseDto } from './dto/health-check-response.dto';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let target: HealthController;
  let healthService: { checkHealth: jest.Mock; checkLiveness: jest.Mock };
  let res: { status: jest.Mock };

  const healthyResponse: HealthCheckResponseDto = {
    status: 'up',
    info: {
      database: { status: 'up' },
      redis: { status: 'up' },
      memory_heap: { status: 'up' },
    },
    details: {
      database: { status: 'up' },
      redis: { status: 'up' },
      memory_heap: { status: 'up' },
    },
  };

  beforeEach(async () => {
    healthService = { checkHealth: jest.fn(), checkLiveness: jest.fn(() => ({ status: 'up' })) };
    res = { status: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    target = module.get(HealthController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('live', () => {
    it('answers up from the service without checking any dependency', () => {
      expect(target.live()).toEqual({ status: 'up' });
      expect(healthService.checkHealth).not.toHaveBeenCalled();
    });
  });

  describe('check', () => {
    it('returns a 200 success payload when the service is ready', async () => {
      healthService.checkHealth.mockResolvedValue(healthyResponse);

      const result = await target.check(res as never);

      expect(result).toEqual({
        statusCode: 200,
        status: 'Success',
        message: 'Health check completed',
        data: healthyResponse,
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    // Regression: a down dependency used to answer HTTP 200 with the failure only in the body, so probes never saw it.
    it('sets the HTTP status to 503 and names the failing component when a dependency is down', async () => {
      const degradedResponse: HealthCheckResponseDto = {
        ...healthyResponse,
        status: 'down',
        error: 'Some services are down',
        info: { ...healthyResponse.info, redis: { status: 'down', message: 'Redis check failed' } },
      };
      healthService.checkHealth.mockResolvedValue(degradedResponse);

      const result = await target.check(res as never);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(result).toEqual({
        statusCode: 503,
        status: 'Failure',
        message: 'Health check failed',
        error: 'Some services are down',
        data: degradedResponse,
      });
    });
  });
});
