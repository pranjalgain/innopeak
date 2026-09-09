import { CurrentTenantUser } from '@auth/decorators/current-tenant-user.decorator';
import type { TenantAuthUser } from '@auth/types/auth-user.type';
import { ApiResponse as ApiResponseDto } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { DashboardService } from './dashboard.service';
import { DashboardWindowQueryDto, RecentEscalatedQueryDto } from './dto/dashboard-request.dto';
import type { MetricsDto } from './dto/metrics.dto';
import type { RatingDistributionDto } from './dto/rating-distribution.dto';
import type { RecentEscalatedDto } from './dto/recent-escalated.dto';
import {
  ApiDashboardMetrics,
  ApiDashboardRatingDistribution,
  ApiDashboardRecentEscalated,
} from './swagger/dashboard.swagger';

/**
 * Read-only analytics for the dashboard's stat cards, rating chart and attention list.
 *
 * Every route is scoped by `@CurrentTenantUser()`. The tenant is never accepted as a parameter:
 * these endpoints return reviewer names and review bodies, so a client-supplied tenant id would
 * let any authenticated user read another business's reviews.
 */
@Controller({ path: RouteNames.DASHBOARD, version: '1' })
@ApiTags('Dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get(RouteNames.METRICS)
  @ApiDashboardMetrics()
  async getMetrics(
    @CurrentTenantUser() user: TenantAuthUser,
    @Query() query: DashboardWindowQueryDto
  ): Promise<ApiResponseDto<MetricsDto>> {
    const metrics = await this.dashboardService.getMetrics(query.days, user.tenantId);
    return ResponseUtil.success(metrics, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.DASHBOARD_RATING_DISTRIBUTION)
  @ApiDashboardRatingDistribution()
  async getRatingDistribution(
    @CurrentTenantUser() user: TenantAuthUser,
    @Query() query: DashboardWindowQueryDto
  ): Promise<ApiResponseDto<RatingDistributionDto>> {
    const distribution = await this.dashboardService.getRatingDistribution(
      query.days,
      user.tenantId
    );
    return ResponseUtil.success({ distribution }, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.DASHBOARD_RECENT_ESCALATED)
  @ApiDashboardRecentEscalated()
  async getRecentEscalated(
    @CurrentTenantUser() user: TenantAuthUser,
    @Query() query: RecentEscalatedQueryDto
  ): Promise<ApiResponseDto<RecentEscalatedDto[]>> {
    const reviews = await this.dashboardService.getRecentEscalated(query.limit, user.tenantId);
    return ResponseUtil.success(reviews, undefined, HttpStatus.OK);
  }
}
