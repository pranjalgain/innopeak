import { CurrentUser } from '@auth/decorators/current-user.decorator';
import type { AuthUser } from '@auth/types/auth.type';
import { ApiResponse as ApiResponseDto } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { DashboardService } from './dashboard.service';
import { DashboardWindowQueryDto, RecentEscalatedQueryDto } from './dto/dashboard-request.dto';
import type { MetricsDto } from './dto/metrics.dto';
import type { RecentEscalatedDto } from './dto/recent-escalated.dto';
import { ApiDashboardMetrics, ApiDashboardRecentEscalated } from './swagger/dashboard.swagger';

/**
 * Every service method narrows to `requireTenantUser()`; the tenant is never a parameter, since a
 * client-supplied id would expose another business's reviewer names and review bodies.
 */
@Controller({ path: RouteNames.DASHBOARD, version: '1' })
@ApiTags('Dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get(RouteNames.METRICS)
  @ApiDashboardMetrics()
  async getMetrics(
    @CurrentUser() user: AuthUser,
    @Query() query: DashboardWindowQueryDto
  ): Promise<ApiResponseDto<MetricsDto>> {
    const metrics = await this.dashboardService.getMetrics(user, query);
    return ResponseUtil.success(metrics, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.DASHBOARD_RECENT_ESCALATED)
  @ApiDashboardRecentEscalated()
  async getRecentEscalated(
    @CurrentUser() user: AuthUser,
    @Query() query: RecentEscalatedQueryDto
  ): Promise<ApiResponseDto<RecentEscalatedDto[]>> {
    const reviews = await this.dashboardService.getRecentEscalated(user, query);
    return ResponseUtil.success(reviews, undefined, HttpStatus.OK);
  }
}
