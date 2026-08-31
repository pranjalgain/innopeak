import { HealthIndicatorService } from '@nestjs/terminus';

import { CustomDatabaseHealthIndicator } from './custom-database-health.indicator';

describe('CustomDatabaseHealthIndicator', () => {
  let target: CustomDatabaseHealthIndicator;
  let dbService: { isHealthy: jest.Mock };
  let healthIndicatorService: HealthIndicatorService;

  beforeEach(() => {
    dbService = { isHealthy: jest.fn() };
    healthIndicatorService = new HealthIndicatorService();
    target = new CustomDatabaseHealthIndicator(dbService as never, healthIndicatorService);
  });

  it('reports up with a healthy message when the database is reachable', async () => {
    dbService.isHealthy.mockResolvedValue(true);

    const result = await target.isHealthy('database');

    expect(result).toEqual({
      database: { status: 'up', message: 'Database connection is healthy' },
    });
  });

  it('reports down when the database check resolves false', async () => {
    dbService.isHealthy.mockResolvedValue(false);

    const result = await target.isHealthy('database');

    expect(result).toEqual({
      database: { status: 'down', message: 'Database health check failed' },
    });
  });

  it('reports down with the error message when the check rejects', async () => {
    dbService.isHealthy.mockRejectedValue(new Error('pool exhausted'));

    const result = await target.isHealthy('database');

    expect(result).toEqual({
      database: {
        status: 'down',
        message: 'Database connection failed',
        error: 'pool exhausted',
      },
    });
  });
});
