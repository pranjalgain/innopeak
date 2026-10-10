import { requirePlatformAdmin } from '@auth/utils/require-platform-admin.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { TtlCache } from '@common/helpers/ttl-cache';
import { AdminStatisticsDbService } from '@db/repositories/admin-statistics/admin-statistics.db-service';
import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth.type';
import { ADMIN_AGGREGATE_CACHE_TTL_MS } from '../constants/admin-overview.constants';
import { AdminStatisticsSummaryResponseDto } from '../dto/admin-statistics-summary-response.dto';

@Injectable()
export class AdminStatisticsService {
  // Platform-wide aggregates, the same scans as the Overview's; see `ADMIN_AGGREGATE_CACHE_TTL_MS`.
  private readonly summaryCache = new TtlCache<AdminStatisticsSummaryResponseDto>(
    ADMIN_AGGREGATE_CACHE_TTL_MS
  );

  constructor(private readonly adminStatisticsDbService: AdminStatisticsDbService) {}

  async getSummary(actor: AuthUser, months: number): Promise<AdminStatisticsSummaryResponseDto> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    return this.summaryCache.getOrLoad(String(months), async () =>
      AdminStatisticsSummaryResponseDto.from(await this.adminStatisticsDbService.getSummary(months))
    );
  }
}
