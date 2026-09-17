import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { SyncHealthStatus } from '@common/enums/sync-health-status.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';

import {
  BackfillProgressResponseDto,
  SyncHealthResponseDto,
  SyncRunListResponseDto,
} from '../dto/connection-response.dto';

const LOCATION_PARAM = ApiParam({
  name: 'locationId',
  example: '0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4',
});

export function ApiBackfillProgress(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    LOCATION_PARAM,
    ApiOperation({
      summary: 'Progress of the one-time historical import',
      description:
        'Polled by the onboarding backfilling stage. **Terminal is `livePollingEnabled`, not ' +
        '`status`** — `status: "ok"` means the import job finished, while ' +
        '`onboardingBackfillCompletedAt` is what un-gates the live poller. Advancing the UI on ' +
        '`status` alone shows the owner "you\'re all set" for a location the scheduler still ' +
        'refuses to enqueue. `progress` is null whenever `totalToImport` is null or zero — the ' +
        'client shows an indeterminate bar rather than a fabricated percentage. Throttled at ' +
        '120/min because a 2-second poll dies on the global 30/min tier inside the first minute.',
    }),
    ApiResponse({
      status: 200,
      type: BackfillProgressResponseDto,
      examples: {
        default: {
          summary: 'Backfill in progress',
          value: {
            locationId: '0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4',
            syncRunId: '0190f4c3-9e07-7d15-a4c8-3f1b6d2e9057',
            status: SyncRunStatus.RUNNING,
            trigger: SyncTrigger.BACKFILL,
            startedAt: '2026-09-01T09:05:03.000Z',
            completedAt: null,
            reviewsFetched: 12,
            totalToImport: 20,
            progress: 60,
            errorMessage: null,
            isStale: false,
            onboardingBackfillCompletedAt: null,
            livePollingEnabled: false,
          },
        },
      },
    }),
    ApiResponse({ status: 404, description: "LOCATION_NOT_FOUND (including another tenant's)" })
  );
}

export function ApiSyncHealth(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    LOCATION_PARAM,
    ApiOperation({
      summary: 'Is ingestion working for this location',
      description:
        "Assembled from the three places that each hold part of the answer: the location's " +
        "rolled-up `last_sync_*` snapshot, the connection's credential health, and any " +
        '`sync_runs` row currently running. `healthy` encodes the combination so no caller ' +
        're-derives it — notably, an inactive location is not "broken", and a location that has ' +
        'never synced is not unhealthy.',
    }),
    ApiResponse({
      status: 200,
      type: SyncHealthResponseDto,
      examples: {
        default: {
          summary: 'Healthy location, no run currently in flight',
          value: {
            locationId: '0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4',
            healthy: true,
            locationStatus: LocationStatus.ACTIVE,
            connectionStatus: ReviewProviderConnectionStatus.ACTIVE,
            lastSyncedAt: '2026-09-01T14:15:00.000Z',
            lastSyncStatus: SyncHealthStatus.OK,
            lastSyncError: null,
            livePollingEnabled: true,
            currentRun: null,
          },
        },
      },
    }),
    ApiResponse({ status: 404, description: 'LOCATION_NOT_FOUND' })
  );
}

export function ApiListSyncRuns(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    LOCATION_PARAM,
    ApiOperation({
      summary: 'Paginated sync-run history, newest first',
      description:
        'What makes "why did this tenant never get review X" answerable from the product rather ' +
        'than a shell on a production box. Both triggers appear in one feed on purpose: seeing ' +
        'the one-time `backfill` run beside the `scheduled` ones is how support confirms backfill ' +
        'actually ran, and a low `reviewsFetched` on it explains thin AI few-shot examples.',
    }),
    ApiQuery({ name: 'page', required: false, example: 1 }),
    ApiQuery({ name: 'pageSize', required: false, example: 20 }),
    ApiQuery({ name: 'status', required: false, enum: SyncRunStatus }),
    ApiQuery({ name: 'trigger', required: false, enum: SyncTrigger }),
    ApiResponse({
      status: 200,
      type: SyncRunListResponseDto,
      examples: {
        default: {
          summary: 'One page of sync-run history',
          value: {
            runs: [
              {
                id: '0190f5aa-7b31-7e02-9c44-1d8f3a6b5c20',
                trigger: SyncTrigger.SCHEDULED,
                status: SyncRunStatus.OK,
                startedAt: '2026-09-01T14:15:00.000Z',
                completedAt: '2026-09-01T14:15:07.000Z',
                reviewsFetched: 3,
                errorMessage: null,
              },
            ],
            meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
          },
        },
      },
    }),
    ApiResponse({ status: 404, description: 'LOCATION_NOT_FOUND' })
  );
}
