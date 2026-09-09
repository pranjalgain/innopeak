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
   * Retrieves aggregated metrics for the given time window.
   */
  async getMetrics(days: number, tenantId: string): Promise<DashboardMetrics> {
    return this.dashboardRepo.getMetrics(days, tenantId);
  }

  /**
   * Retrieves rating distribution (1‑5) for the given time window.
   */
  async getRatingDistribution(days: number, tenantId: string): Promise<Record<number, number>> {
    return this.dashboardRepo.getRatingDistribution(days, tenantId);
  }

  /**
   * Retrieves the most recent escalated reviews still awaiting action.
   */
  async getRecentEscalated(limit: number, tenantId: string): Promise<RecentEscalatedDto[]> {
    return this.dashboardRepo.getRecentEscalated(limit, tenantId);
  }
}
