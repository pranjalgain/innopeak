import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { Injectable } from '@nestjs/common';

import {
  ConnectionsRepository,
  type LocationRow,
  type PollableLocationRow,
  type ProviderConnectionRow,
} from './connections.repository';

import { ReviewSyncRepository, type SyncRunRow } from '../review-sync/review-sync.repository';

/** The index Postgres names on the 23505 a concurrent second backfill raises — 0004_reviews.sql. */
const SYNC_RUN_RUNNING_INDEX = 'idx_sync_runs_location_id_running';

export interface UpsertConnectionInput {
  tenantId: string;
  connectedByUserId: string;
  providerAccountId: string;
  credentialReference: string;
  tokenExpiresAt: Date | null;
}

export interface ConfirmLocationInput {
  tenantId: string;
  userId: string;
  connection: ProviderConnectionRow;
  externalLocationId: string;
  name: string;
  address: string | null;
  /** MVP's one-active-location rule (`MAX_ACTIVE_LOCATIONS`) — passed in rather than imported so
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

/**
 * Thrown from inside `confirmLocation`'s transaction when the authoritative, lock-held recheck
 * of `maxActiveLocations` fails. `ConnectionsService.confirmLocation`'s own pre-check
 * (`assertLocationLimit`) already rejects the common case early and cheaply, before a
 * transaction or advisory lock is even opened — this is the race-safe backstop for the case two
 * concurrent confirms both passed that pre-check. Caught by the service and mapped to the same
 * `ConflictException` the pre-check throws.
 */
export class LocationLimitExceededError extends Error {}

export interface DisconnectResult {
  deactivatedLocationIds: string[];
}

/**
 * Owns every connections transaction. Composes two repositories from *different domains* —
 * `ConnectionsRepository` (connection/location/user_location) and `ReviewSyncRepository`
 * (sync_runs) — by passing one `tx` to both, which is exactly the composition
 * module-structure.md places here rather than in the business service.
 */
@Injectable()
export class ConnectionsDbService {
  constructor(
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly reviewSyncRepository: ReviewSyncRepository
  ) {}

  findConnectionByTenant(tenantId: string): Promise<ProviderConnectionRow | null> {
    return this.connectionsRepository.findConnectionByTenant(tenantId);
  }

  async upsertConnection(input: UpsertConnectionInput): Promise<ProviderConnectionRow> {
    return this.connectionsRepository.transaction(tx =>
      this.connectionsRepository.upsertConnection(tx, input)
    );
  }

  markNeedsReauth(connectionId: string): Promise<void> {
    return this.connectionsRepository.updateConnectionStatus(
      connectionId,
      ReviewProviderConnectionStatus.NEEDS_REAUTH
    );
  }

  markConnectionStatus(
    connectionId: string,
    status: ReviewProviderConnectionStatus
  ): Promise<void> {
    return this.connectionsRepository.updateConnectionStatus(connectionId, status);
  }

  updateTokenExpiry(connectionId: string, tokenExpiresAt: Date): Promise<void> {
    return this.connectionsRepository.updateTokenExpiry(connectionId, tokenExpiresAt);
  }

  findLocationsForUser(userId: string, status?: LocationStatus): Promise<LocationRow[]> {
    return this.connectionsRepository.findLocationsForUser(userId, status);
  }

  findLocationsByTenant(tenantId: string, status?: LocationStatus): Promise<LocationRow[]> {
    return this.connectionsRepository.findLocationsByTenant(tenantId, status);
  }

  findLocationForTenant(locationId: string, tenantId: string): Promise<LocationRow | null> {
    return this.connectionsRepository.findLocationByIdForTenant(locationId, tenantId);
  }

  findLocationsDueForPoll(): Promise<PollableLocationRow[]> {
    return this.connectionsRepository.findLocationsDueForPoll();
  }

  /**
   * The module's one real transaction: upsert the location, attach the user, acquire the backfill
   * run. Three subtleties, all easy to get wrong and all expensive:
   *
   *  1. **The location limit is rechecked here, under an advisory lock, not just by the caller's
   *     pre-check.** `ConnectionsService.assertLocationLimit` runs before this transaction even
   *     opens — a cheap, non-authoritative fast path. Under READ COMMITTED, two concurrent
   *     confirms for *different* `externalLocationId`s can both read zero active locations (there
   *     is nothing yet to lock against) and both pass that pre-check, since neither has committed
   *     anything for the other to see. `acquireLocationConfirmLock` closes it: the second
   *     transaction blocks on the lock until the first commits or rolls back, so its own recheck
   *     here runs against the first one's already-committed result.
   *  2. **The sync-run acquisition is wrapped in its own savepoint.** A duplicate-key on the
   *     partial unique index would otherwise abort the *whole* transaction, so an impatient owner
   *     double-clicking Continue would get "backfill already running" **and no location row** —
   *     the thing they actually asked for silently rolled back.
   *  3. **Nothing is enqueued here.** BullMQ and Postgres share no transaction, so publishing
   *     inside this block lets a worker dequeue a `syncRunId` for a row that has not committed,
   *     find nothing, and mark the run failed. The caller publishes after commit.
   *
   * An already-running backfill is reported rather than thrown, so the endpoint can stay
   * idempotent — the owner gets 200 and the id they need to start polling, which is what they
   * wanted anyway.
   */
  async confirmLocation(input: ConfirmLocationInput): Promise<ConfirmLocationResult> {
    return this.connectionsRepository.transaction(async tx => {
      await this.connectionsRepository.acquireLocationConfirmLock(tx, input.tenantId);

      const active = await this.connectionsRepository.findLocationsByTenant(
        input.tenantId,
        LocationStatus.ACTIVE,
        tx
      );
      const isSameLocation = active.some(
        location => location.externalLocationId === input.externalLocationId
      );

      if (!isSameLocation && active.length >= input.maxActiveLocations) {
        throw new LocationLimitExceededError();
      }

      const location = await this.connectionsRepository.upsertLocation(tx, {
        tenantId: input.tenantId,
        providerConnectionId: input.connection.id,
        // Copied off the connection row, never from the request body: `locations.provider` is
        // denormalized and no constraint keeps it honest.
        provider: input.connection.provider,
        externalLocationId: input.externalLocationId,
        name: input.name,
        address: input.address,
      });

      await this.connectionsRepository.attachUserToLocation(tx, {
        userId: input.userId,
        locationId: location.id,
      });

      try {
        const backfill = await tx.transaction(nested =>
          this.reviewSyncRepository.acquireSyncRun(nested, {
            tenantId: input.tenantId,
            locationId: location.id,
            trigger: SyncTrigger.BACKFILL,
          })
        );

        return { location, backfill, backfillAlreadyRunning: false };
      } catch (error) {
        if (!isUniqueViolation(error, SYNC_RUN_RUNNING_INDEX)) {
          throw error;
        }

        // The savepoint rolled back, not the outer transaction — the location and user_location
        // writes above survive.
        const existing = await this.reviewSyncRepository.findRunningRunForLocation(location.id);
        return { location, backfill: existing, backfillAlreadyRunning: true };
      }
    });
  }

  /**
   * Disconnect. Flips locations to `inactive` and records the owner's intent on the connection
   * row; never deletes anything. See ConnectionsRepository.deactivateLocationsForConnection for
   * the cascade chain that makes deleting so expensive.
   */
  async disconnect(connectionId: string): Promise<DisconnectResult> {
    return this.connectionsRepository.transaction(async tx => {
      const deactivatedLocationIds =
        await this.connectionsRepository.deactivateLocationsForConnection(tx, connectionId);
      await this.connectionsRepository.markConnectionDisconnected(tx, connectionId);

      return { deactivatedLocationIds };
    });
  }

  /**
   * Reconnect counterpart — see `ConnectionsRepository.reactivateLocationsForConnection`. Called
   * only for a same-account reconnect (`ConnectionsService.handleCallback`); a brand-new
   * connection has no prior locations to reactivate.
   */
  async reactivateLocationsForConnection(connectionId: string): Promise<string[]> {
    return this.connectionsRepository.transaction(tx =>
      this.connectionsRepository.reactivateLocationsForConnection(tx, connectionId)
    );
  }

  findLatestBackfillRun(locationId: string): Promise<SyncRunRow | null> {
    return this.reviewSyncRepository.findLatestRunForLocation(locationId, SyncTrigger.BACKFILL);
  }

  findRunningRun(locationId: string): Promise<SyncRunRow | null> {
    return this.reviewSyncRepository.findRunningRunForLocation(locationId);
  }

  listSyncRuns(input: {
    locationId: string;
    page: number;
    pageSize: number;
    status?: SyncRunStatus | undefined;
    trigger?: SyncTrigger | undefined;
  }): Promise<{ runs: SyncRunRow[]; total: number }> {
    return this.reviewSyncRepository.listRunsForLocation(input);
  }
}
