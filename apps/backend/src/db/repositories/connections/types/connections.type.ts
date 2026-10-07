import type { LocationStatus } from '@common/enums/location-status.enum';
import type { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import type { ReviewProvider } from '@common/enums/review-provider.enum';
import type { SyncHealthStatus } from '@common/enums/sync-health-status.enum';

import type { SyncRunRow } from '../../review-sync/types/review-sync.type';

export interface ProviderConnectionRow {
  id: string;
  tenantId: string;
  connectedByUserId: string;
  provider: ReviewProvider;
  providerAccountId: string;
  credentialReference: string;
  tokenExpiresAt: string | null;
  status: ReviewProviderConnectionStatus;
  disconnectedAt: string | null;
  createdAt: string;
}

export interface LocationRow {
  id: string;
  tenantId: string;
  providerConnectionId: string;
  provider: ReviewProvider;
  externalLocationId: string;
  name: string;
  address: string | null;
  status: LocationStatus;
  lastSyncedAt: string | null;
  lastSyncStatus: SyncHealthStatus | null;
  lastSyncError: string | null;
  onboardingBackfillCompletedAt: string | null;
  lastReviewSyncedAt: string | null;
  /**
   * `null` = not paused. Set when over the plan's `max_locations`. Distinct from `status =
   * 'inactive'`: a billing-paused location is still a valid connection, just excluded from polling.
   */
  billingPausedAt: string | null;
  createdAt: string;
}

/**
 * Exactly the fields `IReviewSyncJob` needs. Excludes `lastReviewSyncedAt` on purpose: `runPoll`
 * re-reads the cursor before paginating because a job can sit queued before a worker picks it up.
 */
export interface PollableLocationRow {
  tenantId: string;
  locationId: string;
  connectionId: string;
  externalAccountId: string;
  externalLocationId: string;
}

export interface UpsertConnectionInput {
  tenantId: string;
  connectedByUserId: string;
  providerAccountId: string;
  credentialReference: string;
  tokenExpiresAt: Date | null;
}

export interface UpsertLocationInput {
  tenantId: string;
  providerConnectionId: string;
  /** Copied off the connection row by the DB service — never taken from a request body. */
  provider: ReviewProvider;
  externalLocationId: string;
  name: string;
  address: string | null;
}

export interface ConfirmLocationMatch {
  externalLocationId: string;
  name: string;
  address: string | null;
}

export interface ConfirmLocationsInput {
  tenantId: string;
  userId: string;
  connection: ProviderConnectionRow;
  locations: ConfirmLocationMatch[];
  /**
   * Passed in rather than imported so this data-layer transaction is the one authoritative
   * enforcement point without owning the business constant.
   */
  maxActiveLocations: number;
}

export interface ConfirmLocationResult {
  location: LocationRow;
  backfill: SyncRunRow | null;
  /** True when a live backfill already held the lock — the caller returns 200, not 409. */
  backfillAlreadyRunning: boolean;
}

export interface DisconnectResult {
  deactivatedLocationIds: string[];
}
