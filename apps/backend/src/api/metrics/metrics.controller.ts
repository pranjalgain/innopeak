import { Public } from '@auth/decorators/public.decorator';
import { SKIP_ALL_THROTTLERS } from '@common/constants/throttle.constants';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Controller, Get, Header, Logger, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { register } from 'prom-client';

@Controller({ path: RouteNames.METRICS, version: VERSION_NEUTRAL })
@ApiTags('Metrics')
@SkipThrottle(SKIP_ALL_THROTTLERS)
@Public()
export class MetricsController {
  private readonly logger = new Logger(MetricsController.name);

  @Get()
  @Header('Content-Type', 'text/plain')
  @ApiOperation({ summary: 'Get all Prometheus metrics' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved successfully' })
  @ApiResponse({ status: 500, description: 'Failed to retrieve metrics' })
  async getDefaultMetrics(@Res() res: Response): Promise<void> {
    try {
      const metrics = await register.metrics();
      res.status(200).send(metrics);
    } catch (error) {
      this.logger.error(
        `Error fetching Prometheus metrics: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
      res.status(500).send(ResponseUtil.error('Failed to retrieve metrics', 500, null));
    }
  }
}
