import type { AuthUser } from '@auth/types/auth-user.type';
import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { SyncHealthStatus } from '@common/enums/sync-health-status.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import type { LocationRow } from '@db/repositories/connections/connections.repository';
import { Injectable } from '@nestjs/common';

import { SYNC_RUNS_PAGE_SIZE_DEFAULT } from '../constants/connections.constants';
import type {
  BackfillProgressResponseDto,
  SyncHealthResponseDto,
  SyncRunListResponseDto,
} from '../dto/connection-response.dto';
import { LocationNotFoundException } from '../exceptions/connections.exceptions';
import { computeBackfillProgress, isSyncRunStale } from '../utils/connections.utils';

@Injectable()
export class ConnectionsSyncService {
  constructor(private readonly connectionsDbService: ConnectionsDbService) {}

  async getBackfillProgress(input: {
    user: AuthUser;
    locationId: string;
  }): Promise<BackfillProgressResponseDto> {
    const tenantUser = requireTenantUser(input.user);
    const location = await this.requireLocation({
      tenantId: tenantUser.tenantId,
      locationId: input.locationId,
    });
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
      progress: computeBackfillProgress(run),
      errorMessage: run?.errorMessage ?? null,
      isStale: isSyncRunStale(run),
      onboardingBackfillCompletedAt: location.onboardingBackfillCompletedAt,
      // The only correct signal for advancing the UI to "done". `status === 'ok'` means the job
      // finished; this means the poller is actually un-gated (PLAN.md §8.2). Advancing on `ok`
      // alone shows "you're all set" for a location the scheduler still refuses to enqueue.
      livePollingEnabled: location.onboardingBackfillCompletedAt !== null,
    };
  }

  async getSyncHealth(input: {
    user: AuthUser;
    locationId: string;
  }): Promise<SyncHealthResponseDto> {
    const tenantUser = requireTenantUser(input.user);
    const location = await this.requireLocation({
      tenantId: tenantUser.tenantId,
      locationId: input.locationId,
    });
    const [connection, currentRun] = await Promise.all([
      this.connectionsDbService.findConnectionByTenant(tenantUser.tenantId),
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
            isStale: isSyncRunStale(currentRun),
          }
        : null,
    };
  }

  async listSyncRuns(input: {
    user: AuthUser;
    locationId: string;
    page?: number | undefined;
    pageSize?: number | undefined;
    status?: SyncRunStatus | undefined;
    trigger?: SyncTrigger | undefined;
  }): Promise<SyncRunListResponseDto> {
    const tenantUser = requireTenantUser(input.user);
    const location = await this.requireLocation({
      tenantId: tenantUser.tenantId,
      locationId: input.locationId,
    });
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
      throw new LocationNotFoundException();
    }

    return location;
  }
}
