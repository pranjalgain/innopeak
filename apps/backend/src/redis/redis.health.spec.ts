import { HealthIndicatorService } from '@nestjs/terminus';

import { RedisHealthIndicator } from './redis.health';

describe('RedisHealthIndicator', () => {
  let target: RedisHealthIndicator;
  let redisClient: { ping: jest.Mock };
  let healthIndicatorService: HealthIndicatorService;

  beforeEach(() => {
    redisClient = { ping: jest.fn() };
    healthIndicatorService = new HealthIndicatorService();
    target = new RedisHealthIndicator(redisClient as never, healthIndicatorService);
  });

  it('reports up when the ping succeeds', async () => {
    redisClient.ping.mockResolvedValue('PONG');

    const result = await target.isHealthy('redis');

    expect(result).toEqual({ redis: { status: 'up' } });
  });

  it('reports down with the error message when the ping rejects', async () => {
    redisClient.ping.mockRejectedValue(new Error('connection refused'));

    const result = await target.isHealthy('redis');

    expect(result).toEqual({
      redis: { status: 'down', message: 'connection refused' },
    });
  });
});
