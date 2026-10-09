import { PaginationMetaDto } from '@common/dto/pagination-meta.dto';
import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { ReviewProvider } from '@common/enums/review-provider.enum';
import { SyncHealthStatus } from '@common/enums/sync-health-status.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ConnectionState } from '../enums/connection-state.enum';
import { ReturnTo } from '../enums/return-to.enum';

export class ConnectionSummaryDto {
  @ApiProperty({ example: '0190f4c1-8a21-7c33-9f01-2b7d5e8a4410' })
  id!: string;

  @ApiProperty({ example: ReviewProvider.GOOGLE, enum: ReviewProvider })
  provider!: ReviewProvider;

  @ApiProperty({ example: 'accounts/108327761122' })
  providerAccountId!: string;

  @ApiProperty({
    example: ReviewProviderConnectionStatus.ACTIVE,
    enum: ReviewProviderConnectionStatus,
  })
  connectionStatus!: ReviewProviderConnectionStatus;

  @ApiPropertyOptional({ example: '2026-09-04T10:12:00.000Z', nullable: true })
  tokenExpiresAt!: string | null;

  @ApiProperty({ example: '0190f3b2-4c17-7a88-b210-9e4f1c7d3a02' })
  connectedByUserId!: string;

  @ApiProperty({ example: '2026-09-01T09:04:11.000Z' })
  connectedAt!: string;
}

export class ConnectionLocationDto {
  @ApiProperty({ example: '0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4' })
  id!: string;

  @ApiProperty({ example: ReviewProvider.GOOGLE, enum: ReviewProvider })
  provider!: ReviewProvider;

  @ApiProperty({ example: 'locations/12345678901234567890' })
  externalLocationId!: string;

  @ApiProperty({
    example: 'The Coastal Table',
    description: "Alias of locations.name, matching the frontend's ConnectionInfo.businessName.",
  })
  businessName!: string;

  @ApiPropertyOptional({ example: '214 Harbor St, Portland, ME', nullable: true })
  address!: string | null;

  @ApiProperty({ example: LocationStatus.ACTIVE, enum: LocationStatus })
  status!: LocationStatus;

  @ApiPropertyOptional({ example: '2026-09-01T14:15:00.000Z', nullable: true })
  lastSyncedAt!: string | null;

  @ApiPropertyOptional({ example: SyncHealthStatus.OK, enum: SyncHealthStatus, nullable: true })
  lastSyncStatus!: SyncHealthStatus | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  lastSyncError!: string | null;

  @ApiPropertyOptional({
    example: '2026-09-01T09:11:42.000Z',
    nullable: true,
    description: 'NULL means live polling is still gated on the backfill finishing.',
  })
  onboardingBackfillCompletedAt!: string | null;
}

export class ConnectionStatusResponseDto {
  @ApiProperty({
    example: true,
    description: 'True only when an active connection AND an active location both exist.',
  })
  connected!: boolean;

  @ApiProperty({ example: ConnectionState.CONNECTED, enum: ConnectionState })
  status!: ConnectionState;

  @ApiPropertyOptional({ type: ConnectionSummaryDto, nullable: true })
  connection!: ConnectionSummaryDto | null;

  @ApiPropertyOptional({ type: ConnectionLocationDto, nullable: true })
  location!: ConnectionLocationDto | null;
}

export class AvailableLocationDto {
  @ApiProperty({ example: 'locations/12345678901234567890' })
  externalLocationId!: string;

  @ApiProperty({ example: 'The Coastal Table' })
  name!: string;

  @ApiPropertyOptional({ example: '214 Harbor St, Portland, ME', nullable: true })
  address!: string | null;

  @ApiProperty({
    example: false,
    description: 'True when a locations row already exists for this connection + external id.',
  })
  alreadyConnected!: boolean;
}

export class AvailableLocationsResponseDto {
  @ApiProperty({ example: ReviewProvider.GOOGLE, enum: ReviewProvider })
  provider!: ReviewProvider;

  @ApiProperty({ example: '0190f4c1-8a21-7c33-9f01-2b7d5e8a4410' })
  connectionId!: string;

  @ApiProperty({ type: [AvailableLocationDto] })
  locations!: AvailableLocationDto[];
}

export class LocationDto {
  @ApiProperty({ example: '0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4' })
  id!: string;

  @ApiProperty({ example: '0190f4c1-8a21-7c33-9f01-2b7d5e8a4410' })
  connectionId!: string;

  @ApiProperty({ example: ReviewProvider.GOOGLE, enum: ReviewProvider })
  provider!: ReviewProvider;

  @ApiProperty({ example: 'locations/12345678901234567890' })
  externalLocationId!: string;

  @ApiProperty({ example: 'The Coastal Table' })
  name!: string;

  @ApiPropertyOptional({ example: '214 Harbor St, Portland, ME', nullable: true })
  address!: string | null;

  @ApiProperty({ example: LocationStatus.ACTIVE, enum: LocationStatus })
  status!: LocationStatus;

  @ApiPropertyOptional({ example: '2026-09-01T14:15:00.000Z', nullable: true })
  lastSyncedAt!: string | null;

  @ApiPropertyOptional({ example: SyncHealthStatus.OK, enum: SyncHealthStatus, nullable: true })
  lastSyncStatus!: SyncHealthStatus | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  lastSyncError!: string | null;

  @ApiPropertyOptional({ example: '2026-09-01T09:11:42.000Z', nullable: true })
  onboardingBackfillCompletedAt!: string | null;

  @ApiProperty({ example: '2026-09-01T09:05:02.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description:
      "Set when a billing plan downgrade left this location over the plan's location cap — " +
      'still a live, owned connection, just excluded from the 15-minute poll until a plan change ' +
      'or PUT /v1/billing/active-location clears it. Distinct from `status`: a paused location is ' +
      'still `active`, not `inactive` (that means the owner disconnected it).',
  })
  billingPausedAt!: string | null;
}

export class LocationListResponseDto {
  @ApiProperty({ type: [LocationDto] })
  locations!: LocationDto[];
}

export class BackfillSummaryDto {
  @ApiProperty({ example: '0190f4c3-9e07-7d15-a4c8-3f1b6d2e9057' })
  syncRunId!: string;

  @ApiProperty({ example: SyncRunStatus.RUNNING, enum: SyncRunStatus })
  status!: SyncRunStatus;

  /**
   * Not always `backfill`: if a run was already in flight for the location, this describes that run
   * (on a live location, the 15-minute `scheduled` sync).
   */
  @ApiProperty({ example: SyncTrigger.BACKFILL, enum: SyncTrigger })
  trigger!: SyncTrigger;

  @ApiProperty({ example: '2026-09-01T09:05:03.000Z' })
  startedAt!: string;
}

export class ConfirmLocationResponseDto extends LocationDto {
  @ApiPropertyOptional({ type: BackfillSummaryDto, nullable: true })
  backfill!: BackfillSummaryDto | null;

  @ApiProperty({
    example: false,
    description:
      'True when a backfill was already running and this call reused it. The endpoint stays 201 ' +
      'and idempotent rather than 409, so a double-clicking owner still gets a locationId to poll.',
  })
  backfillAlreadyRunning!: boolean;
}

export class ConfirmLocationsResponseDto {
  @ApiProperty({
    type: [ConfirmLocationResponseDto],
    description: 'One entry per confirmed location, in the same order as the request.',
  })
  locations!: ConfirmLocationResponseDto[];
}

export class BackfillProgressResponseDto {
  @ApiProperty({ example: '0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4' })
  locationId!: string;

  @ApiPropertyOptional({ example: '0190f4c3-9e07-7d15-a4c8-3f1b6d2e9057', nullable: true })
  syncRunId!: string | null;

  @ApiPropertyOptional({ example: SyncRunStatus.RUNNING, enum: SyncRunStatus, nullable: true })
  status!: SyncRunStatus | null;

  @ApiPropertyOptional({ example: SyncTrigger.BACKFILL, nullable: true })
  trigger!: SyncTrigger.BACKFILL | null;

  @ApiPropertyOptional({ example: '2026-09-01T09:05:03.000Z', nullable: true })
  startedAt!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  completedAt!: string | null;

  @ApiPropertyOptional({ example: 12, nullable: true })
  reviewsFetched!: number | null;

  @ApiPropertyOptional({
    example: 20,
    nullable: true,
    description: 'sync_runs.reviews_total — null when the provider reported no total.',
  })
  totalToImport!: number | null;

  @ApiPropertyOptional({
    example: 60,
    nullable: true,
    description:
      '0-100. Null whenever totalToImport is null or zero — never synthesized. The client shows ' +
      'an indeterminate bar rather than a fabricated percentage.',
  })
  progress!: number | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  errorMessage!: string | null;

  @ApiProperty({
    example: false,
    description: 'Running, with no progress written for over 30 minutes.',
  })
  isStale!: boolean;

  @ApiPropertyOptional({ example: null, nullable: true })
  onboardingBackfillCompletedAt!: string | null;

  @ApiProperty({
    example: false,
    description:
      'The ONLY correct signal for advancing the UI to done. sync_runs.status = "ok" means the ' +
      'job finished; this means the poller is actually un-gated.',
  })
  livePollingEnabled!: boolean;
}

export class CurrentRunDto {
  @ApiProperty({ example: '0190f5aa-7b31-7e02-9c44-1d8f3a6b5c20' })
  id!: string;

  @ApiProperty({ example: SyncTrigger.SCHEDULED, enum: SyncTrigger })
  trigger!: SyncTrigger;

  @ApiProperty({ example: '2026-09-01T14:30:00.000Z' })
  startedAt!: string;

  @ApiProperty({ example: false })
  isStale!: boolean;
}

export class SyncHealthResponseDto {
  @ApiProperty({ example: '0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4' })
  locationId!: string;

  @ApiProperty({ example: true })
  healthy!: boolean;

  @ApiProperty({ example: LocationStatus.ACTIVE, enum: LocationStatus })
  locationStatus!: LocationStatus;

  @ApiProperty({
    example: ReviewProviderConnectionStatus.ACTIVE,
    enum: ReviewProviderConnectionStatus,
  })
  connectionStatus!: ReviewProviderConnectionStatus;

  @ApiPropertyOptional({ example: '2026-09-01T14:15:00.000Z', nullable: true })
  lastSyncedAt!: string | null;

  @ApiPropertyOptional({ example: SyncHealthStatus.OK, enum: SyncHealthStatus, nullable: true })
  lastSyncStatus!: SyncHealthStatus | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  lastSyncError!: string | null;

  @ApiProperty({ example: true })
  livePollingEnabled!: boolean;

  @ApiPropertyOptional({ type: CurrentRunDto, nullable: true })
  currentRun!: CurrentRunDto | null;
}

export class SyncRunDto {
  @ApiProperty({ example: '0190f5aa-7b31-7e02-9c44-1d8f3a6b5c20' })
  id!: string;

  @ApiProperty({ example: SyncTrigger.SCHEDULED, enum: SyncTrigger })
  trigger!: SyncTrigger;

  @ApiProperty({ example: SyncRunStatus.OK, enum: SyncRunStatus })
  status!: SyncRunStatus;

  @ApiProperty({ example: '2026-09-01T14:15:00.000Z' })
  startedAt!: string;

  @ApiPropertyOptional({ example: '2026-09-01T14:15:07.000Z', nullable: true })
  completedAt!: string | null;

  @ApiPropertyOptional({ example: 3, nullable: true })
  reviewsFetched!: number | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  errorMessage!: string | null;
}

export class SyncRunListResponseDto {
  @ApiProperty({ type: [SyncRunDto] })
  runs!: SyncRunDto[];

  @ApiProperty({
    type: PaginationMetaDto,
    description:
      'Nested inside data on purpose — TransformInterceptor rebuilds the response envelope and ' +
      'would drop a top-level meta.',
  })
  meta!: PaginationMetaDto;
}

export class DisconnectResponseDto {
  @ApiProperty({ example: ReviewProvider.GOOGLE, enum: ReviewProvider })
  provider!: ReviewProvider;

  @ApiProperty({ example: ['0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4'] })
  deactivatedLocationIds!: string[];

  @ApiProperty({
    example: true,
    description:
      "False when the provider's revoke call failed. The local deactivation still succeeded — " +
      'leaving a tenant unable to disconnect is worse than an unrevoked upstream grant.',
  })
  credentialRevoked!: boolean;

  @ApiProperty({ example: true })
  pollingStopped!: boolean;
}

export class PendingAccountDto {
  @ApiProperty({
    example: 'accounts/108327761122',
    description: 'Send this back to select the account.',
  })
  accountId!: string;

  @ApiPropertyOptional({ example: 'The Coastal Group', nullable: true })
  name!: string | null;

  @ApiPropertyOptional({
    example: 'LOCATION_GROUP',
    nullable: true,
    description: "Google's account type: PERSONAL, LOCATION_GROUP, USER_GROUP or ORGANIZATION.",
  })
  type!: string | null;
}

export class PendingAccountsResponseDto {
  @ApiProperty({
    type: [PendingAccountDto],
    example: [
      { accountId: 'accounts/104912287365', name: 'Jane Doe', type: 'PERSONAL' },
      { accountId: 'accounts/108327761122', name: 'The Coastal Group', type: 'LOCATION_GROUP' },
    ],
  })
  accounts!: PendingAccountDto[];
}

export class SelectAccountResponseDto {
  @ApiProperty({ example: '0190f4c1-8a21-7c33-9f01-2b7d5e8a4410' })
  connectionId!: string;

  @ApiProperty({ example: 'accounts/108327761122' })
  accountId!: string;

  @ApiProperty({
    enum: ReturnTo,
    example: ReturnTo.SETTINGS,
    description:
      'The screen that started the connect flow. `settings`: go to Settings → Connection; `onboarding`: carry on choosing locations.',
  })
  returnTo!: ReturnTo;
}
