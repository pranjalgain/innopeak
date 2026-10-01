import { requirePlatformAdmin } from '@auth/utils/require-platform-admin.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { AdminStatisticsDbService } from '@db/repositories/admin-statistics/admin-statistics.db-service';
import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth.type';
import { AdminStatisticsSummaryResponseDto } from '../dto/admin-statistics-summary-response.dto';

@Injectable()
export class AdminStatisticsService {
  constructor(private readonly adminStatisticsDbService: AdminStatisticsDbService) {}

  async getSummary(actor: AuthUser, months: number): Promise<AdminStatisticsSummaryResponseDto> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const summary = await this.adminStatisticsDbService.getSummary(months);
    return AdminStatisticsSummaryResponseDto.from(summary);
  }
}
