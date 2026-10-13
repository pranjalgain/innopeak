import { Public } from '@auth/decorators/public.decorator';
import { SKIP_ALL_THROTTLERS } from '@common/constants/throttle.constants';
import { RouteNames } from '@common/route-names';
import { HealthService } from '@health/health.service';
import { Controller, Get, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';

import { HealthCheckFailureResponseDto } from './dto/health-check-failure-response.dto';
import { HealthCheckSuccessResponseDto } from './dto/health-check-success-response.dto';

@Controller({ path: RouteNames.HEALTH, version: VERSION_NEUTRAL })
@ApiTags('Health')
@SkipThrottle(SKIP_ALL_THROTTLERS)
@Public()
// @ApiExcludeController()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get(RouteNames.HEALTH_LIVE)
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Answers 200 while the process can serve a request. Checks no dependency, so an outage of the database or Redis does not get a healthy instance restarted.',
  })
  live(): { status: 'up' } {
    return this.healthService.checkLiveness();
  }

  @Get(['', RouteNames.HEALTH_READY])
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Answers 200 when this instance can serve traffic (database and Redis reachable, heap below 90% of its limit) and **503** otherwise, so a load balancer or orchestrator stops routing to it. Third-party services are not probed. The body names the failing component but never the underlying error.',
  })
  @ApiResponse({ status: 200, type: HealthCheckSuccessResponseDto })
  @ApiResponse({ status: 503, type: HealthCheckFailureResponseDto })
  async check(
    @Res({ passthrough: true }) res: Response
  ): Promise<HealthCheckFailureResponseDto | HealthCheckSuccessResponseDto> {
    const result = await this.healthService.checkHealth();

    if (result.status === 'down') {
      // The HTTP status, not just the body: probes and load balancers read the status line.
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        statusCode: 503,
        status: 'Failure',
        message: 'Health check failed',
        error: result.error ?? 'Some services are down',
        data: result,
      };
    }

    return {
      statusCode: 200,
      status: 'Success',
      message: 'Health check completed',
      data: result,
    };
  }
}
