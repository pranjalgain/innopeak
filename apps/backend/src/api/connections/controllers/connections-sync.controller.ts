import { CurrentUser } from '@auth/decorators/current-user.decorator';
import type { AuthUser } from '@auth/types/auth.type';
import { ApiResponse as ApiResponseDto } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

import { BACKFILL_POLL_THROTTLE } from '../constants/connections.constants';
import { ListSyncRunsQueryDto } from '../dto/connection-request.dto';
import type {
  BackfillProgressResponseDto,
  SyncHealthResponseDto,
  SyncRunListResponseDto,
} from '../dto/connection-response.dto';
import { ConnectionsSyncService } from '../services/connections-sync.service';
import {
  ApiBackfillProgress,
  ApiListSyncRuns,
  ApiSyncHealth,
} from '../swagger/connections-sync.swagger';

@Controller({ path: RouteNames.CONNECTIONS, version: '1' })
@ApiTags('Connections — Sync')
export class ConnectionsSyncController {
  constructor(private readonly connectionsSyncService: ConnectionsSyncService) {}

  /**
   * The one route with a throttle override. At the global `short` tier (30/min) the onboarding
   * screen's ~2.5-second poll exceeds the limit inside the first minute and the owner's progress
   * bar dies with a 429 mid-onboarding.
   *
   * `ThrottlerGuard` evaluates **every** configured tier per request, and `@Throttle` overrides
   * only the tiers it names — so raising `short` alone is not enough. At 24 requests/minute this
   * poll blows through `medium` (100 per 5 min) in about four minutes, `long` (500 per 30 min) in
   * about twenty, and `very-long` (1000 per hour) in about forty. Each of those would 429 an
   * import that is still legitimately running.
   *
   * They are skipped rather than re-numbered per tier: this route's budget is fully expressed by
   * `BACKFILL_POLL_THROTTLE`, and four hand-maintained numbers that all have to stay consistent
   * with one poll interval is a worse invariant than one. The route is cheap (two indexed
   * single-row reads) and requires a tenant-owned `locationId`, so its own per-minute ceiling is
   * the meaningful limit.
   *
   * NOTE: this only became load-bearing when the global tiers' `ttl` was corrected from seconds
   * to milliseconds. Before that they were 60-300ms windows that reset before they could ever
   * bind, which is why a `short`-only override appeared to work.
   */
  @Get(RouteNames.LOCATION_BACKFILL)
  @Throttle({ short: BACKFILL_POLL_THROTTLE })
  @SkipThrottle({ medium: true, long: true, 'very-long': true })
  @ApiBackfillProgress()
  async getBackfill(
    @CurrentUser() user: AuthUser,
    @Param('locationId', ParseUUIDPipe) locationId: string
  ): Promise<ApiResponseDto<BackfillProgressResponseDto>> {
    const response = await this.connectionsSyncService.getBackfillProgress({ user, locationId });
    return ResponseUtil.success(response, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.LOCATION_SYNC_HEALTH)
  @ApiSyncHealth()
  async getSyncHealth(
    @CurrentUser() user: AuthUser,
    @Param('locationId', ParseUUIDPipe) locationId: string
  ): Promise<ApiResponseDto<SyncHealthResponseDto>> {
    const response = await this.connectionsSyncService.getSyncHealth({ user, locationId });
    return ResponseUtil.success(response, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.LOCATION_SYNC_RUNS)
  @ApiListSyncRuns()
  async listSyncRuns(
    @CurrentUser() user: AuthUser,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() query: ListSyncRunsQueryDto
  ): Promise<ApiResponseDto<SyncRunListResponseDto>> {
    const response = await this.connectionsSyncService.listSyncRuns({
      user,
      locationId,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      trigger: query.trigger,
    });

    return ResponseUtil.success(response, undefined, HttpStatus.OK);
  }
}
