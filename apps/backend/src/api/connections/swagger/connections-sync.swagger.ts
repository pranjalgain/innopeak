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
    ApiResponse({ status: 200, type: BackfillProgressResponseDto }),
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
    ApiResponse({ status: 200, type: SyncHealthResponseDto }),
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
    ApiResponse({ status: 200, type: SyncRunListResponseDto }),
    ApiResponse({ status: 404, description: 'LOCATION_NOT_FOUND' })
  );
}
