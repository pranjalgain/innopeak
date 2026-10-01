import type { LocationStatus } from '@common/enums/location-status.enum';
import type { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import type { ReviewProvider } from '@common/enums/review-provider.enum';
import type { SyncHealthStatus } from '@common/enums/sync-health-status.enum';

import type { SyncRunRow } from '../../review-sync/types/review-sync.type';

// ─── Connections repository rows ─────────────────────────────────────────────

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
  /** `null` = not paused. Set when a tenant is over their plan's `max_locations` — see
   *  `0011_billing.sql`'s column comment and `BillingEntitlementsService`. Deliberately distinct
   *  from `status = 'inactive'`: a billing-paused location is still a live, valid connection, just
   *  excluded from the poll while over the cap. */
  billingPausedAt: string | null;
  createdAt: string;
}

/**
 * A location the poller may enqueue a `review-poll` job for — exactly the fields `IReviewSyncJob`
 * needs. Deliberately excludes `lastReviewSyncedAt`: `runPoll` re-reads that cursor itself right
 * before paginating rather than trusting a value baked into the job payload at enqueue time,
 * since a BullMQ job can sit queued for a while before a worker picks it up.
 */
export interface PollableLocationRow {
  tenantId: string;
  locationId: string;
  connectionId: string;
  externalAccountId: string;
  externalLocationId: string;
}

// ─── Repository inputs ────────────────────────────────────────────────────────

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

// ─── ConnectionsDbService inputs/results ──────────────────────────────────────

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
  /** MVP's location-count ceiling (`MAX_ACTIVE_LOCATIONS`) — passed in rather than imported so
   *  this data-layer transaction stays the one place that authoritatively enforces it, without
   *  owning the business constant itself. See `acquireLocationConfirmLock`. */
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
