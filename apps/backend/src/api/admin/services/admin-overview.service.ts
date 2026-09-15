import { requirePlatformAdmin } from '@auth/utils/require-platform-admin.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth-user.type';
import { PlatformActivityResponseDto } from '../dto/platform-activity-response.dto';
import { PlatformReviewStatsResponseDto } from '../dto/platform-review-stats-response.dto';

@Injectable()
export class AdminOverviewService {
  constructor(private readonly adminOverviewDbService: AdminOverviewDbService) {}

  async getReviewStats(actor: AuthUser): Promise<PlatformReviewStatsResponseDto> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const stats = await this.adminOverviewDbService.getReviewStats();
    return PlatformReviewStatsResponseDto.from(stats);
  }

  async getRecentActivity(actor: AuthUser, limit: number): Promise<PlatformActivityResponseDto[]> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const rows = await this.adminOverviewDbService.getRecentActivity(limit);
    return rows.map(row => PlatformActivityResponseDto.from(row));
  }
}
