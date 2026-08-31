import { DBService } from '@db/db.service';
import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';

@Injectable()
export class CustomDatabaseHealthIndicator {
  constructor(
    private readonly dbService: DBService,
    private readonly healthIndicatorService: HealthIndicatorService
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      const isHealthy = await this.dbService.isHealthy();

      if (isHealthy) {
        return indicator.up({ message: 'Database connection is healthy' });
      }

      return indicator.down({ message: 'Database health check failed' });
    } catch (error) {
      return indicator.down({
        message: 'Database connection failed',
        error: (error as Error).message,
      });
    }
  }
}
