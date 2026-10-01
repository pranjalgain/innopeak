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
 * `DashboardRepository`'s raw queries carry no meaning of their own — the policy of what counts
 * as "open", which locations count when none is named, and how the rating chart's buckets are
 * shaped all live here, above the mechanical layer.
 */
@Injectable()
export class DashboardDbService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  /**
   * A review is "open" while it still needs someone to act on it. `responded` and `dismissed` are
   * both terminal, so neither belongs in a backlog count.
   */
  private static readonly OPEN_STATUSES = [ReviewStatus.NEW, ReviewStatus.IN_REVIEW];

  /**
   * Aggregated metrics for the dashboard's stat cards, plus the same window's rating
   * distribution, optionally scoped to one location.
   *
   * `total`, `avgRating` and `ratingDistribution` are windowed; `pending` and `escalated` are not
   * — see `MetricsDto`, which documents why each card counts what it counts.
   */
  async getMetrics(days: number, scope: DashboardScopeInput): Promise<DashboardMetrics> {
    const row = await this.dashboardRepository.getMetrics(days, await this.toQueryScope(scope));

    // Zero-filled first so every bucket exists even for an empty window — the client renders five
    // bars unconditionally — then overlaid with the rows that came back.
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

  /** The most recently reviewed escalations still awaiting action, optionally scoped to one location. */
  async getRecentEscalated(
    limit: number,
    scope: DashboardScopeInput
  ): Promise<RecentEscalatedRow[]> {
    return this.dashboardRepository.getRecentEscalated(limit, await this.toQueryScope(scope));
  }

  /** Bridges the caller's `DashboardScopeInput` into the repository's already-resolved `DashboardQueryScope`. */
  private async toQueryScope(scope: DashboardScopeInput): Promise<DashboardQueryScope> {
    return {
      tenantId: scope.tenantId,
      locationIds: await this.resolveLocationScope(scope),
      openStatuses: DashboardDbService.OPEN_STATUSES,
    };
  }

  /**
   * Which locations' reviews count toward a figure: one named location, or — when none is named —
   * every location the tenant *currently* has, not every location it has ever had.
   *
   * `reviews.tenant_id` alone was the old answer, and it silently included deactivated ones. A
   * tenant that disconnects and reconnects under a different Google account gets fresh `locations`
   * rows (the upsert's conflict target is `(provider_connection_id, external_location_id)`, and
   * the connection id changed), so the same business's reviews are imported a second time under a
   * new `location_id` while the originals linger on the deactivated row. Every un-scoped total —
   * review count, pending, escalated, the rating distribution — then read roughly double, for a
   * location the Business Switcher no longer offers and the tenant cannot get back to.
   *
   * `findActiveLocationIds` now also excludes a paused (over-cap) location — always fetched, even
   * for an explicitly named `locationId`, so that name is validated against the same set rather
   * than trusted outright: without this, a downgraded tenant could still pull full metrics for the
   * location their plan paused just by naming it in the query string, even though the unscoped
   * "every current location" view (and the review queue itself) already hide it.
   */
  private async resolveLocationScope(scope: DashboardScopeInput): Promise<string[]> {
    const activeLocationIds = await this.dashboardRepository.findActiveLocationIds(scope.tenantId);
    if (scope.locationId) {
      return activeLocationIds.includes(scope.locationId) ? [scope.locationId] : [];
    }
    return activeLocationIds;
  }
}
