import type { AuthUser } from '@auth/types/auth-user.type';
import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { MESSAGES } from '@common/constants/messages.constants';
import type { DashboardMetrics } from '@db/repositories/dashboard/dashboard.repository';
import { DashboardRepository } from '@db/repositories/dashboard/dashboard.repository';
import { Injectable } from '@nestjs/common';

import type { RecentEscalatedDto } from './dto/recent-escalated.dto';

/**
 * Service layer for dashboard analytics.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepo: DashboardRepository) {}

  /**
   * Retrieves aggregated metrics — including the rating distribution (1‑5) — for the given time
   * window.
   */
  async getMetrics(days: number, user: AuthUser): Promise<DashboardMetrics> {
    const tenantUser = requireTenantUser(user, MESSAGES.DASHBOARD.TENANT_ONLY);
    return this.dashboardRepo.getMetrics(days, tenantUser.tenantId);
  }

  /**
   * Retrieves the most recent escalated reviews still awaiting action.
   */
  async getRecentEscalated(limit: number, user: AuthUser): Promise<RecentEscalatedDto[]> {
    const tenantUser = requireTenantUser(user, MESSAGES.DASHBOARD.TENANT_ONLY);
    return this.dashboardRepo.getRecentEscalated(limit, tenantUser.tenantId);
  }
}
