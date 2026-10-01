import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import type { AuthUser } from '@auth/types/auth.type';
import { ApiResponse as ApiResponseDto } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AdminBusinessResponseDto } from '../dto/admin-business-response.dto';
import { AdminOverviewStatsResponseDto } from '../dto/admin-overview-stats-response.dto';
import { AdminSignupTrendPointResponseDto } from '../dto/admin-signup-trend-point-response.dto';
import { ListPlatformActivityQueryDto } from '../dto/list-platform-activity-query.dto';
import { NeedsAttentionQueryDto } from '../dto/needs-attention-query.dto';
import {
  PlatformActivityListResponseDto,
  PlatformActivityResponseDto,
} from '../dto/platform-activity-response.dto';
import { RecentActivityQueryDto } from '../dto/recent-activity-query.dto';
import { RecentBusinessesQueryDto } from '../dto/recent-businesses-query.dto';
import { SignupTrendQueryDto } from '../dto/signup-trend-query.dto';
import { AdminOverviewService } from '../services/admin-overview.service';
import {
  ApiGetNeedsAttention,
  ApiGetOverviewStats,
  ApiGetRecentActivity,
  ApiGetRecentBusinesses,
  ApiGetSignupTrend,
  ApiListPlatformActivity,
} from '../swagger/admin-overview.swagger';

@Controller({ path: RouteNames.ADMIN_OVERVIEW, version: '1' })
@ApiTags('Admin — Overview')
@Roles(JwtTokenType.PLATFORM_ADMIN)
export class AdminOverviewController {
  constructor(private readonly adminOverviewService: AdminOverviewService) {}

  @Get(RouteNames.ADMIN_OVERVIEW_STATS)
  @ApiGetOverviewStats()
  async getStats(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponseDto<AdminOverviewStatsResponseDto>> {
    const result = await this.adminOverviewService.getStats(user);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.ADMIN_OVERVIEW_RECENT_BUSINESSES)
  @ApiGetRecentBusinesses()
  async getRecentBusinesses(
    @CurrentUser() user: AuthUser,
    @Query() query: RecentBusinessesQueryDto
  ): Promise<ApiResponseDto<AdminBusinessResponseDto[]>> {
    const result = await this.adminOverviewService.getRecentBusinesses(user, query.limit);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.ADMIN_OVERVIEW_NEEDS_ATTENTION)
  @ApiGetNeedsAttention()
  async getNeedsAttention(
    @CurrentUser() user: AuthUser,
    @Query() query: NeedsAttentionQueryDto
  ): Promise<ApiResponseDto<AdminBusinessResponseDto[]>> {
    const result = await this.adminOverviewService.getNeedsAttention(user, query.limit);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.ADMIN_OVERVIEW_SIGNUP_TREND)
  @ApiGetSignupTrend()
  async getSignupTrend(
    @CurrentUser() user: AuthUser,
    @Query() query: SignupTrendQueryDto
  ): Promise<ApiResponseDto<AdminSignupTrendPointResponseDto[]>> {
    const result = await this.adminOverviewService.getSignupTrend(user, query.months);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.ADMIN_OVERVIEW_ACTIVITY)
  @ApiGetRecentActivity()
  async getRecentActivity(
    @CurrentUser() user: AuthUser,
    @Query() query: RecentActivityQueryDto
  ): Promise<ApiResponseDto<PlatformActivityResponseDto[]>> {
    const result = await this.adminOverviewService.getRecentActivity(user, query.limit);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.ADMIN_OVERVIEW_ACTIVITY_LOG)
  @ApiListPlatformActivity()
  async listActivity(
    @CurrentUser() user: AuthUser,
    @Query() query: ListPlatformActivityQueryDto
  ): Promise<ApiResponseDto<PlatformActivityListResponseDto>> {
    const result = await this.adminOverviewService.listActivity(user, query);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }
}
