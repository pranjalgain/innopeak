import type { AuthUser } from '@auth/types/auth.type';
import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { DashboardDbService } from '@db/repositories/dashboard/dashboard.db-service';
import type { DashboardMetrics } from '@db/repositories/dashboard/types/dashboard.type';
import { Injectable } from '@nestjs/common';

import type { DashboardWindowQueryDto, RecentEscalatedQueryDto } from './dto/dashboard-request.dto';
import type { RecentEscalatedDto } from './dto/recent-escalated.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly dashboardDbService: DashboardDbService) {}

  async getMetrics(user: AuthUser, query: DashboardWindowQueryDto): Promise<DashboardMetrics> {
    const tenantUser = requireTenantUser(user, MESSAGES.DASHBOARD.TENANT_ONLY);
    return this.dashboardDbService.getMetrics(query.days, {
      tenantId: tenantUser.tenantId,
      locationId: query.locationId,
    });
  }

  async getRecentEscalated(
    user: AuthUser,
    query: RecentEscalatedQueryDto
  ): Promise<RecentEscalatedDto[]> {
    const tenantUser = requireTenantUser(user, MESSAGES.DASHBOARD.TENANT_ONLY);
    return this.dashboardDbService.getRecentEscalated(query.limit, {
      tenantId: tenantUser.tenantId,
      locationId: query.locationId,
    });
  }
}
