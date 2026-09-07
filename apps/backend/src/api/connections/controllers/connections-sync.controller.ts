import { CurrentTenantUser } from '@auth/decorators/current-tenant-user.decorator';
import type { TenantAuthUser } from '@auth/types/auth-user.type';
import { ApiResponse as ApiResponseDto } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

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
   * screen's 2-second poll exceeds the limit inside the first minute and the owner's progress bar
   * dies with a 429 mid-onboarding. The named tiers cannot express this — `medium` is 100 per
   * *five* minutes, which is stricter, not looser.
   */
  @Get(RouteNames.LOCATION_BACKFILL)
  @Throttle({ short: BACKFILL_POLL_THROTTLE })
  @ApiBackfillProgress()
  async getBackfill(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('locationId', ParseUUIDPipe) locationId: string
  ): Promise<ApiResponseDto<BackfillProgressResponseDto>> {
    const response = await this.connectionsSyncService.getBackfillProgress({
      tenantId: user.tenantId,
      locationId,
    });

    return ResponseUtil.success(response, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.LOCATION_SYNC_HEALTH)
  @ApiSyncHealth()
  async getSyncHealth(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('locationId', ParseUUIDPipe) locationId: string
  ): Promise<ApiResponseDto<SyncHealthResponseDto>> {
    const response = await this.connectionsSyncService.getSyncHealth({
      tenantId: user.tenantId,
      locationId,
    });

    return ResponseUtil.success(response, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.LOCATION_SYNC_RUNS)
  @ApiListSyncRuns()
  async listSyncRuns(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() query: ListSyncRunsQueryDto
  ): Promise<ApiResponseDto<SyncRunListResponseDto>> {
    const response = await this.connectionsSyncService.listSyncRuns({
      tenantId: user.tenantId,
      locationId,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      trigger: query.trigger,
    });

    return ResponseUtil.success(response, undefined, HttpStatus.OK);
  }
}
