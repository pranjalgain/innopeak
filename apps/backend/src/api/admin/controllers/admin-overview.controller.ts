import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import type { AuthUser } from '@auth/types/auth-user.type';
import { ApiResponse as ApiResponseDto } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PlatformActivityResponseDto } from '../dto/platform-activity-response.dto';
import { PlatformReviewStatsResponseDto } from '../dto/platform-review-stats-response.dto';
import { RecentActivityQueryDto } from '../dto/recent-activity-query.dto';
import { AdminOverviewService } from '../services/admin-overview.service';
import { ApiGetPlatformReviewStats, ApiGetRecentActivity } from '../swagger/admin-overview.swagger';

@Controller({ path: RouteNames.ADMIN_OVERVIEW, version: '1' })
@ApiTags('Admin — Overview')
@Roles(JwtTokenType.PLATFORM_ADMIN)
export class AdminOverviewController {
  constructor(private readonly adminOverviewService: AdminOverviewService) {}

  @Get(RouteNames.ADMIN_OVERVIEW_REVIEW_STATS)
  @ApiGetPlatformReviewStats()
  async getReviewStats(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponseDto<PlatformReviewStatsResponseDto>> {
    const result = await this.adminOverviewService.getReviewStats(user);
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
}
