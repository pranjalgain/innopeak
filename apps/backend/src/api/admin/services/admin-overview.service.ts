import { requirePlatformAdmin } from '@auth/utils/require-platform-admin.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { TtlCache } from '@common/helpers/ttl-cache';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth.type';
import {
  ACTIVITY_LOG_PAGE_SIZE_DEFAULT,
  ADMIN_AGGREGATE_CACHE_TTL_MS,
} from '../constants/admin-overview.constants';
import { AdminBusinessResponseDto } from '../dto/admin-business-response.dto';
import { AdminOverviewStatsResponseDto } from '../dto/admin-overview-stats-response.dto';
import { AdminSignupTrendPointResponseDto } from '../dto/admin-signup-trend-point-response.dto';
import type { ListPlatformActivityQueryDto } from '../dto/list-platform-activity-query.dto';
import {
  PlatformActivityListResponseDto,
  PlatformActivityResponseDto,
} from '../dto/platform-activity-response.dto';
import { fillSignupTrendWindow } from '../utils/signup-trend.utils';

@Injectable()
export class AdminOverviewService {
  // Platform-wide numbers (no tenant filter, so full scans no index can help) shared by every admin. The recent-businesses,
  // needs-attention and activity reads are not cached: they are what an admin looks at right after acting.
  private readonly statsCache = new TtlCache<AdminOverviewStatsResponseDto>(
    ADMIN_AGGREGATE_CACHE_TTL_MS
  );
  private readonly signupTrendCache = new TtlCache<AdminSignupTrendPointResponseDto[]>(
    ADMIN_AGGREGATE_CACHE_TTL_MS
  );

  constructor(private readonly adminOverviewDbService: AdminOverviewDbService) {}

  async getStats(actor: AuthUser): Promise<AdminOverviewStatsResponseDto> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    return this.statsCache.getOrLoad('stats', async () =>
      AdminOverviewStatsResponseDto.from(await this.adminOverviewDbService.getStats())
    );
  }

  async getRecentBusinesses(actor: AuthUser, limit: number): Promise<AdminBusinessResponseDto[]> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const summaries = await this.adminOverviewDbService.getRecentBusinesses(limit);
    return summaries.map(summary => AdminBusinessResponseDto.from(summary));
  }

  async getNeedsAttention(actor: AuthUser, limit: number): Promise<AdminBusinessResponseDto[]> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const businesses = await this.adminOverviewDbService.getBusinessesNeedingAttention(limit);
    return businesses.map(business => AdminBusinessResponseDto.from(business));
  }

  async getSignupTrend(
    actor: AuthUser,
    months: number
  ): Promise<AdminSignupTrendPointResponseDto[]> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    return this.signupTrendCache.getOrLoad(String(months), async () => {
      const points = await this.adminOverviewDbService.getSignupTrend(months);
      return fillSignupTrendWindow(points, months).map(point =>
        AdminSignupTrendPointResponseDto.from(point)
      );
    });
  }

  /** The newest `limit` entries of `platform_activity_log`: the Overview page's glance feed (the Activity page pages through the same rows). */
  async getRecentActivity(actor: AuthUser, limit: number): Promise<PlatformActivityResponseDto[]> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const rows = await this.adminOverviewDbService.getRecentActivity(limit);
    return rows.map(row => PlatformActivityResponseDto.from(row));
  }

  async listActivity(
    actor: AuthUser,
    query: ListPlatformActivityQueryDto
  ): Promise<PlatformActivityListResponseDto> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? ACTIVITY_LOG_PAGE_SIZE_DEFAULT;

    const { activities, total } = await this.adminOverviewDbService.listActivity({
      page,
      pageSize,
      type: query.type,
    });

    return {
      activities: activities.map(row => PlatformActivityResponseDto.from(row)),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }
}
