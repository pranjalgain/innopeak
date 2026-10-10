import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { isDeterministicDbError } from '@db/helpers/pg-error.util';
import { AdminBusinessesDbService } from '@db/repositories/admin-businesses/admin-businesses.db-service';
import type { AdminBusinessSummary } from '@db/repositories/admin-businesses/types/admin-businesses.type';
import { AdminUsersDbService } from '@db/repositories/admin-users/admin-users.db-service';
import { Injectable, Logger } from '@nestjs/common';
import { Counter, register } from 'prom-client';

import { AdminOverviewRepository } from './admin-overview.repository';
import type {
  AdminOverviewStats,
  PlatformActivityRow,
  PlatformReviewStats,
  RecordActivityInput,
  SignupTrendPoint,
} from './types/admin-overview.type';

const ACTIVITY_RECORD_ATTEMPTS = 3;
const ACTIVITY_RETRY_DELAYS_MS = [100, 500];

/** `platform_activity_log`'s VARCHAR(255) columns: a longer value would fail the insert (SQLSTATE 22001) for good. */
const ACTIVITY_COLUMN_MAX = 255;

const trim = (value: string): string => value.slice(0, ACTIVITY_COLUMN_MAX);

function fitActivityToColumns(input: RecordActivityInput): RecordActivityInput {
  return {
    ...input,
    actorEmail: trim(input.actorEmail),
    ...(input.businessName === undefined ? {} : { businessName: trim(input.businessName) }),
    ...(input.targetEmail === undefined ? {} : { targetEmail: trim(input.targetEmail) }),
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Get-or-create: the default registry rejects a second metric of the same name (tests, hot reload). */
function activityDroppedCounter(): Counter<'type'> {
  const existing = register.getSingleMetric('platform_activity_dropped_total');
  return (
    (existing as Counter<'type'> | undefined) ??
    new Counter({
      name: 'platform_activity_dropped_total',
      help: 'Admin activity-log entries that could not be recorded after retries (the action itself succeeded).',
      labelNames: ['type'],
    })
  );
}

/** Created at load, so the series exists at 0 from the start: an alert on a rate needs the metric to be there. */
const activityDropped = activityDroppedCounter();

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
   * failing here would 500 a request that succeeded. Instead of a single try and a log line, a transient failure is
   * retried, a value too long for its column is trimmed first, and an entry that still cannot be written is counted
   * (`platform_activity_dropped_total`, alertable) and logged with its full payload so it can be replayed by hand.
   * Not a guarantee: only writing the entry in the same transaction as the action it records would be, which these
   * call sites don't do. The feed is therefore not a complete record for anything compliance-bound.
   */
  async recordActivityBestEffort(input: RecordActivityInput): Promise<void> {
    const entry = fitActivityToColumns(input);

    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.adminOverviewRepository.recordActivity(entry);
        return;
      } catch (error) {
        const retryable = !isDeterministicDbError(error) && attempt < ACTIVITY_RECORD_ATTEMPTS;
        if (retryable) {
          this.logger.warn(
            `Recording platform activity (${entry.type}) failed on attempt ${attempt}; retrying: ${errorText(error)}`
          );
          await sleep(ACTIVITY_RETRY_DELAYS_MS[attempt - 1] ?? 500);
          continue;
        }

        activityDropped.inc({ type: entry.type });
        this.logger.error(
          `Dropped platform activity (${entry.type}) after ${attempt} attempt(s): ${errorText(error)}. ` +
            `Payload for manual replay: ${JSON.stringify({ ...entry, droppedAt: new Date().toISOString() })}`,
          error instanceof Error ? error.stack : undefined
        );
        return;
      }
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
