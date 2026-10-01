import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import type { AuthUser } from '@auth/types/auth.type';
import { ApiResponse as ApiResponseDto } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AdminStatisticsSummaryQueryDto } from '../dto/admin-statistics-summary-query.dto';
import { AdminStatisticsSummaryResponseDto } from '../dto/admin-statistics-summary-response.dto';
import { AdminStatisticsService } from '../services/admin-statistics.service';
import { ApiGetStatisticsSummary } from '../swagger/admin-statistics.swagger';

/** Deeper platform-wide analytics than `AdminOverviewController`'s four headline stat cards — see
 *  `ApiGetStatisticsSummary`'s own doc comment for what this covers. */
@Controller({ path: RouteNames.ADMIN_STATISTICS, version: '1' })
@ApiTags('Admin — Statistics')
@Roles(JwtTokenType.PLATFORM_ADMIN)
export class AdminStatisticsController {
  constructor(private readonly adminStatisticsService: AdminStatisticsService) {}

  @Get(RouteNames.ADMIN_STATISTICS_SUMMARY)
  @ApiGetStatisticsSummary()
  async getSummary(
    @CurrentUser() user: AuthUser,
    @Query() query: AdminStatisticsSummaryQueryDto
  ): Promise<ApiResponseDto<AdminStatisticsSummaryResponseDto>> {
    const result = await this.adminStatisticsService.getSummary(user, query.months);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }
}
