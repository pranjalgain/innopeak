import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';

@Injectable()
export class CustomHttpHealthIndicator {
  constructor(private readonly healthIndicatorService: HealthIndicatorService) {}

  async pingCheck(key: string, url: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (response.ok) {
        return indicator.up({ httpStatus: response.status, url });
      }

      return indicator.down({ error: `HTTP ${response.status}: ${response.statusText}`, url });
    } catch (error) {
      return indicator.down({ error: (error as Error).message, url });
    }
  }
}
