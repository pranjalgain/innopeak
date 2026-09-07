import { MESSAGES } from '@common/constants/messages.constants';
import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { SyncHealthStatus } from '@common/enums/sync-health-status.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import type { LocationRow } from '@db/repositories/connections/connections.repository';
import type { SyncRunRow } from '@db/repositories/review-sync/review-sync.repository';
import { Injectable, NotFoundException } from '@nestjs/common';

import {
  CONNECTION_ERROR_CODES,
  STALE_RUN_MINUTES,
  SYNC_RUNS_PAGE_SIZE_DEFAULT,
} from '../constants/connections.constants';
import type {
  BackfillProgressResponseDto,
  SyncHealthResponseDto,
  SyncRunListResponseDto,
} from '../dto/connection-response.dto';

@Injectable()
export class ConnectionsSyncService {
  constructor(private readonly connectionsDbService: ConnectionsDbService) {}

  async getBackfillProgress(input: {
    tenantId: string;
    locationId: string;
  }): Promise<BackfillProgressResponseDto> {
    const location = await this.requireLocation(input);
    const run = await this.connectionsDbService.findLatestBackfillRun(location.id);

    return {
      locationId: location.id,
      syncRunId: run?.id ?? null,
      status: run?.status ?? null,
      trigger: run ? SyncTrigger.BACKFILL : null,
      startedAt: run?.startedAt ?? null,
      completedAt: run?.completedAt ?? null,
      reviewsFetched: run?.reviewsFetched ?? null,
      totalToImport: run?.reviewsTotal ?? null,
      progress: this.computeProgress(run),
      errorMessage: run?.errorMessage ?? null,
      isStale: this.isStale(run),
      onboardingBackfillCompletedAt: location.onboardingBackfillCompletedAt,
      // The only correct signal for advancing the UI to "done". `status === 'ok'` means the job
      // finished; this means the poller is actually un-gated (PLAN.md §8.2). Advancing on `ok`
      // alone shows "you're all set" for a location the scheduler still refuses to enqueue.
      livePollingEnabled: location.onboardingBackfillCompletedAt !== null,
    };
  }

  async getSyncHealth(input: {
    tenantId: string;
    locationId: string;
  }): Promise<SyncHealthResponseDto> {
    const location = await this.requireLocation(input);
    const [connection, currentRun] = await Promise.all([
      this.connectionsDbService.findConnectionByTenant(input.tenantId),
      this.connectionsDbService.findRunningRun(location.id),
    ]);

    const connectionStatus = connection?.status ?? ReviewProviderConnectionStatus.NEEDS_REAUTH;

    return {
      locationId: location.id,
      // "Never synced" is not unhealthy — a location confirmed 30 seconds ago has no sync history
      // and reporting it as broken would light up a warning on every fresh onboarding.
      healthy:
        location.status === LocationStatus.ACTIVE &&
        connectionStatus === ReviewProviderConnectionStatus.ACTIVE &&
        (location.lastSyncStatus === SyncHealthStatus.OK || location.lastSyncStatus === null),
      locationStatus: location.status,
      connectionStatus,
      lastSyncedAt: location.lastSyncedAt,
      lastSyncStatus: location.lastSyncStatus,
      lastSyncError: location.lastSyncError,
      livePollingEnabled: location.onboardingBackfillCompletedAt !== null,
      currentRun: currentRun
        ? {
            id: currentRun.id,
            trigger: currentRun.trigger,
            startedAt: currentRun.startedAt,
            isStale: this.isStale(currentRun),
          }
        : null,
    };
  }

  async listSyncRuns(input: {
    tenantId: string;
    locationId: string;
    page?: number | undefined;
    pageSize?: number | undefined;
    status?: SyncRunStatus | undefined;
    trigger?: SyncTrigger | undefined;
  }): Promise<SyncRunListResponseDto> {
    const location = await this.requireLocation(input);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? SYNC_RUNS_PAGE_SIZE_DEFAULT;

    const { runs, total } = await this.connectionsDbService.listSyncRuns({
      locationId: location.id,
      page,
      pageSize,
      status: input.status,
      trigger: input.trigger,
    });

    return {
      runs: runs.map(run => ({
        id: run.id,
        trigger: run.trigger,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        reviewsFetched: run.reviewsFetched,
        errorMessage: run.errorMessage,
      })),
      // Nested inside `data` — TransformInterceptor rebuilds the envelope and would drop a
      // top-level `meta`.
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  /**
   * `null` whenever there is no denominator **or the denominator is zero** — never a synthesized
   * percentage. A location with zero reviews would otherwise divide by zero and produce `NaN`,
   * which serializes to `null` in JSON anyway but only by accident.
   */
  private computeProgress(run: SyncRunRow | null): number | null {
    if (!run?.reviewsTotal) {
      return null;
    }

    const fetched = run.reviewsFetched ?? 0;
    return Math.min(100, Math.round((fetched / run.reviewsTotal) * 100));
  }

  /**
   * Measured from the last *progress* write, not from `started_at` — the job updates
   * `reviews_fetched` (and `updated_at`) after every page, so a legitimately long import is not
   * reported as stale simply for being long. Uses `startedAt` when a run has written nothing yet.
   *
   * The UI treats this as "taking longer than usual" copy rather than a failure, because the run
   * may still be alive; what makes it actionable is that acquisition will now reclaim it.
   */
  private isStale(run: SyncRunRow | null): boolean {
    if (!run || run.status !== SyncRunStatus.RUNNING) {
      return false;
    }

    // Same predicate the database reclaim uses — GREATEST(started_at, updated_at) — so the API
    // and the lock can never disagree about whether a run is wedged.
    const lastActivity = Math.max(
      new Date(run.startedAt).getTime(),
      new Date(run.updatedAt).getTime()
    );
    return Date.now() - lastActivity > STALE_RUN_MINUTES * 60 * 1000;
  }

  /** 404 for another tenant's location too — never 403, or the response confirms the id exists. */
  private async requireLocation(input: {
    tenantId: string;
    locationId: string;
  }): Promise<LocationRow> {
    const location = await this.connectionsDbService.findLocationForTenant(
      input.locationId,
      input.tenantId
    );

    if (!location) {
      throw new NotFoundException({
        message: MESSAGES.CONNECTIONS.LOCATION_NOT_FOUND,
        code: CONNECTION_ERROR_CODES.LOCATION_NOT_FOUND,
      });
    }

    return location;
  }
}
