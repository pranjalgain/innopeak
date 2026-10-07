import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { AdminBusinessesDbService } from '@db/repositories/admin-businesses/admin-businesses.db-service';
import type { AdminBusinessSummary } from '@db/repositories/admin-businesses/types/admin-businesses.type';
import { AdminUsersDbService } from '@db/repositories/admin-users/admin-users.db-service';
import { Injectable, Logger } from '@nestjs/common';

import { AdminOverviewRepository } from './admin-overview.repository';
import type {
  AdminOverviewStats,
  PlatformActivityRow,
  PlatformReviewStats,
  RecordActivityInput,
  SignupTrendPoint,
} from './types/admin-overview.type';

@Injectable()
export class AdminOverviewDbService {
  private readonly logger = new Logger(AdminOverviewDbService.name);

  constructor(
    private readonly adminOverviewRepository: AdminOverviewRepository,
    // Composing sibling DB Services reuses their row-to-summary mapping instead of duplicating it.
    private readonly adminBusinessesDbService: AdminBusinessesDbService,
    private readonly adminUsersDbService: AdminUsersDbService
  ) {}

  /**
   * `Promise.allSettled`, not `all`: a failing source is logged and defaulted to zero so it never blanks the other stat
   * cards. `getReviewStats()` keeps its own `Promise.all`; reviews and replies are one source.
   */
  async getStats(): Promise<AdminOverviewStats> {
    const [businessCountResult, userCountResult, reviewStatsResult] = await Promise.allSettled([
      this.adminBusinessesDbService.count(),
      this.adminUsersDbService.count(),
      this.adminOverviewRepository.getReviewStats(),
    ]);

    const businessCount = this.resolveStatSource(businessCountResult, 0, 'business count');
    const userCount = this.resolveStatSource(userCountResult, 0, 'user count');
    const reviewStats = this.resolveStatSource(
      reviewStatsResult,
      { totalReviewsFetched: 0, totalRepliesSent: 0 },
      'review stats'
    );

    return { businessCount, userCount, ...reviewStats };
  }

  /** Logs at `warn` (not `error`): this degrades a read to a fallback rather than dropping an acknowledged write, but stays visible to ops. */
  private resolveStatSource<T>(result: PromiseSettledResult<T>, fallback: T, source: string): T {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    this.logger.warn(
      `Failed to load admin overview ${source}, defaulting to zero`,
      result.reason instanceof Error ? result.reason.stack : String(result.reason)
    );
    return fallback;
  }

  async getRecentBusinesses(limit: number): Promise<AdminBusinessSummary[]> {
    return this.adminBusinessesDbService.findRecent(limit);
  }

  /** Passthrough to `findNeedingAttention()`, which filters, sorts and limits in SQL. */
  async getBusinessesNeedingAttention(limit: number): Promise<AdminBusinessSummary[]> {
    return this.adminBusinessesDbService.findNeedingAttention(limit);
  }

  async getSignupTrend(monthsBack: number): Promise<SignupTrendPoint[]> {
    return this.adminOverviewRepository.getSignupTrend(monthsBack);
  }

  /** Passthrough, exposed so `AdminStatisticsDbService` can reuse this query. */
  async getReviewStats(): Promise<PlatformReviewStats> {
    return this.adminOverviewRepository.getReviewStats();
  }

  /**
   * Never throws: callers record activity after their primary write committed (the two aren't in one transaction), so
   * failing here would 500 a request that succeeded. A dropped entry is logged at error level instead.
   */
  async recordActivityBestEffort(input: RecordActivityInput): Promise<void> {
    try {
      await this.adminOverviewRepository.recordActivity(input);
    } catch (error) {
      this.logger.error(
        `Failed to record platform activity (${input.type}) for actor ${input.actorEmail}`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  async getRecentActivity(limit: number): Promise<PlatformActivityRow[]> {
    return this.adminOverviewRepository.getRecentActivity(limit);
  }

  listActivity(input: {
    page: number;
    pageSize: number;
    type?: PlatformActivityType | undefined;
  }): Promise<{ activities: PlatformActivityRow[]; total: number }> {
    return this.adminOverviewRepository.listActivity(input);
  }
}
