import { requirePlatformAdmin } from '@auth/utils/require-platform-admin.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth.type';
import { ACTIVITY_LOG_PAGE_SIZE_DEFAULT } from '../constants/admin-overview.constants';
import { AdminBusinessResponseDto } from '../dto/admin-business-response.dto';
import { AdminOverviewStatsResponseDto } from '../dto/admin-overview-stats-response.dto';
import { AdminSignupTrendPointResponseDto } from '../dto/admin-signup-trend-point-response.dto';
import type { ListPlatformActivityQueryDto } from '../dto/list-platform-activity-query.dto';
import {
  PlatformActivityListResponseDto,
  PlatformActivityResponseDto,
} from '../dto/platform-activity-response.dto';
import { buildActivityFeed } from '../utils/activity-feed.utils';
import { fillSignupTrendWindow } from '../utils/signup-trend.utils';

@Injectable()
export class AdminOverviewService {
  constructor(private readonly adminOverviewDbService: AdminOverviewDbService) {}

  async getStats(actor: AuthUser): Promise<AdminOverviewStatsResponseDto> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const stats = await this.adminOverviewDbService.getStats();
    return AdminOverviewStatsResponseDto.from(stats);
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
    const points = await this.adminOverviewDbService.getSignupTrend(months);
    return fillSignupTrendWindow(points, months).map(point =>
      AdminSignupTrendPointResponseDto.from(point)
    );
  }

  /** Merges the admin-action log with synthesized `business_joined` entries; see `buildActivityFeed` for why `limit` rows per source suffice. */
  async getRecentActivity(actor: AuthUser, limit: number): Promise<PlatformActivityResponseDto[]> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const [rows, businesses] = await Promise.all([
      this.adminOverviewDbService.getRecentActivity(limit),
      this.adminOverviewDbService.getRecentBusinesses(limit),
    ]);
    const activities = rows.map(row => PlatformActivityResponseDto.from(row));
    return buildActivityFeed(activities, businesses, limit);
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
