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
   * The onboarding poll (~2.5s) would 429 at the global `short` tier. `ThrottlerGuard` evaluates every tier
   * and `@Throttle` overrides only those it names, so the other tiers are skipped (not re-numbered) to
   * keep `BACKFILL_POLL_THROTTLE` the single budget; the route is cheap and tenant-scoped.
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
