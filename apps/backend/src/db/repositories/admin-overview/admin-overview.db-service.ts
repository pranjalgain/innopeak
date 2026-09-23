import {
  AdminBusinessesDbService,
  type AdminBusinessSummary,
} from '@db/repositories/admin-businesses/admin-businesses.db-service';
import { AdminUsersDbService } from '@db/repositories/admin-users/admin-users.db-service';
import { Injectable, Logger } from '@nestjs/common';

import {
  AdminOverviewRepository,
  type PlatformActivityRow,
  type RecordActivityInput,
  type SignupTrendPoint,
} from './admin-overview.repository';

/** The Overview page's four stat cards, composed from three otherwise-unrelated sources — none of
 * which has its own reason to expose this particular grouping. */
export interface AdminOverviewStats {
  businessCount: number;
  userCount: number;
  totalReviewsFetched: number;
  totalRepliesSent: number;
}

@Injectable()
export class AdminOverviewDbService {
  private readonly logger = new Logger(AdminOverviewDbService.name);

  constructor(
    private readonly adminOverviewRepository: AdminOverviewRepository,
    // Cross-domain composition, not a layering violation: a DB Service's job is composing
    // repository calls, and here that extends to composing sibling DB Services — reusing
    // `AdminBusinessesDbService`/`AdminUsersDbService`'s own row-to-summary mapping rather than
    // duplicating it, exactly as it stays if a tenant/user's owning-repository shape changes.
    private readonly adminBusinessesDbService: AdminBusinessesDbService,
    private readonly adminUsersDbService: AdminUsersDbService
  ) {}

  /**
   * The three sources below (business count, user count, review stats) were three independent
   * endpoints/hooks before being folded into this one `getStats()` call — each with its own
   * zero-fallback on failure, so one source going down never blanked the other stat cards. Using
   * `Promise.allSettled` instead of `Promise.all` restores exactly that per-source isolation:
   * a rejection from any one of the three is logged and defaulted to zero rather than rejecting
   * the whole response. `getReviewStats()`'s own internal `Promise.all` (reviews vs. replies) is
   * left as-is — those two counts were always fetched together as a single source in the pre-split
   * hook (one `PlatformReviewStatsService.get()` query backing both fields), so this matches the
   * original granularity rather than introducing a finer one.
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

  /**
   * Unwraps one `getStats()` source's settled outcome, logging and defaulting to `fallback` on
   * rejection instead of letting it propagate — see `getStats()`'s doc comment for why. Logged at
   * `warn` (not `error`, unlike `recordActivityBestEffort`'s catch) because this degrades a read
   * to a stale/zero value rather than dropping a write the admin already believes succeeded; it's
   * still surfaced, not silently swallowed, so an ops person can see a source is unhealthy.
   */
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

  /**
   * The businesses the "Needs Attention" panel shows, already filtered to non-connected tenants,
   * ordered most-urgent-first, and capped at `limit` — a plain passthrough to
   * `AdminBusinessesDbService.findNeedingAttention()`, which does the actual filter/sort/limit in
   * SQL rather than loading every tenant to derive this in JS.
   */
  async getBusinessesNeedingAttention(limit: number): Promise<AdminBusinessSummary[]> {
    return this.adminBusinessesDbService.findNeedingAttention(limit);
  }

  async getSignupTrend(monthsBack: number): Promise<SignupTrendPoint[]> {
    return this.adminOverviewRepository.getSignupTrend(monthsBack);
  }

  /**
   * Never throws. Every caller records activity *after* its primary write has already committed
   * (suspending a business, creating or deleting an invite), and those two writes are not in one
   * transaction — so letting a failure here propagate would answer a request that genuinely
   * succeeded with a 500, telling the admin their action did not apply when it did. That is worse
   * than losing a line of this display feed: this table is now the only record of the action (no
   * generic audit trail behind it to fall back on), but failing a suspend/invite/disable that has
   * already taken effect over a logging hiccup would be a strictly worse outcome for the admin —
   * so a dropped entry is logged at error level, so it is still visible rather than silent, and
   * swallowed rather than surfaced as a failure of the action itself.
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
}
