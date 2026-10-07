import { ReviewStatus } from '@common/enums/review-status.enum';
import { Injectable } from '@nestjs/common';

import { DashboardRepository } from './dashboard.repository';
import type {
  DashboardMetrics,
  DashboardQueryScope,
  DashboardScopeInput,
  RecentEscalatedRow,
} from './types/dashboard.type';

/**
 * The repository's raw queries carry no policy; what counts as "open", which locations count when
 * none is named, and the rating-bucket shape live here.
 */
@Injectable()
export class DashboardDbService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  /**
   * "Open" means still needing action; `responded` and `dismissed` are terminal and stay out of a
   * backlog count.
   */
  private static readonly OPEN_STATUSES = [ReviewStatus.NEW, ReviewStatus.IN_REVIEW];

  /**
   * Stat-card metrics plus the same window's rating distribution. `total`, `avgRating` and
   * `ratingDistribution` are windowed; `pending` and `escalated` are not (see `MetricsDto`).
   */
  async getMetrics(days: number, scope: DashboardScopeInput): Promise<DashboardMetrics> {
    const row = await this.dashboardRepository.getMetrics(days, await this.toQueryScope(scope));

    // Zero-filled first so every bucket exists even for an empty window (the client renders five
    // bars unconditionally), then overlaid with the returned rows.
    const ratingDistribution: Record<number, number> = {};
    for (let rating = 1; rating <= 5; rating++) {
      ratingDistribution[rating] = 0;
    }
    for (const bucket of row.ratingCounts) {
      ratingDistribution[bucket.rating] = bucket.value;
    }

    return {
      total: row.total,
      avgRating: row.avgRating,
      pending: row.pending,
      escalated: row.escalated,
      ratingDistribution,
    };
  }

  /** The most recently reviewed escalations still awaiting action. */
  async getRecentEscalated(
    limit: number,
    scope: DashboardScopeInput
  ): Promise<RecentEscalatedRow[]> {
    return this.dashboardRepository.getRecentEscalated(limit, await this.toQueryScope(scope));
  }

  private async toQueryScope(scope: DashboardScopeInput): Promise<DashboardQueryScope> {
    return {
      tenantId: scope.tenantId,
      locationIds: await this.resolveLocationScope(scope),
      openStatuses: DashboardDbService.OPEN_STATUSES,
    };
  }

  /**
   * Which locations count toward a figure: the one named, or every location the tenant currently
   * has. `reviews.tenant_id` alone double-counted: reconnecting under a different Google account
   * creates fresh `locations` rows, so the same reviews are imported again under a new
   * `location_id` while the originals linger on the deactivated row.
   *
   * `findActiveLocationIds` also excludes paused (over-cap) locations and is always fetched, even
   * for a named `locationId`, so the name is validated against that set; otherwise a downgraded
   * tenant could pull metrics for a paused location just by naming it.
   */
  private async resolveLocationScope(scope: DashboardScopeInput): Promise<string[]> {
    const activeLocationIds = await this.dashboardRepository.findActiveLocationIds(scope.tenantId);
    if (scope.locationId) {
      return activeLocationIds.includes(scope.locationId) ? [scope.locationId] : [];
    }
    return activeLocationIds;
  }
}
