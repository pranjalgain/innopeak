import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { DrizzleTransaction } from '@db/db.service';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { Injectable } from '@nestjs/common';

import { ConnectionsRepository } from './connections.repository';
import type {
  ConfirmLocationResult,
  ConfirmLocationsInput,
  DisconnectResult,
  LocationRow,
  PollableLocationRow,
  ProviderConnectionRow,
  UpdateLocationDetailsInput,
  UpdateLocationRatingInput,
  UpsertConnectionInput,
} from './types/connections.type';

import { ReviewSyncRepository } from '../review-sync/review-sync.repository';
import type { SyncRunRow } from '../review-sync/types/review-sync.type';

/** The index Postgres names on the 23505 a concurrent second backfill raises. */
const SYNC_RUN_RUNNING_INDEX = 'idx_sync_runs_location_id_running';

/**
 * Thrown inside `confirmLocation`'s transaction when the lock-held recheck of `maxActiveLocations`
 * fails: the race-safe backstop for concurrent confirms that both passed the service's pre-check.
 * Mapped to the same `ConflictException` as the pre-check.
 */
export class LocationLimitExceededError extends Error {}

/**
 * Owns every connections transaction, composing repositories from different domains
 * (`ConnectionsRepository`, `ReviewSyncRepository`) by passing one `tx` to both.
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

  /** `true` when this call is what moved it into `needs_reauth`, so only that caller announces it. */
  markNeedsReauth(connectionId: string): Promise<boolean> {
    return this.connectionsRepository.markNeedsReauth(connectionId);
  }

  markConnectionStatus(
    connectionId: string,
    status: ReviewProviderConnectionStatus
  ): Promise<void> {
    return this.connectionsRepository.updateConnectionStatus(connectionId, status);
  }

  markReviewsReconciled(locationId: string): Promise<void> {
    return this.connectionsRepository.markReviewsReconciled(locationId);
  }

  markLocationDetailsAttempted(locationId: string): Promise<void> {
    return this.connectionsRepository.markLocationDetailsAttempted(locationId);
  }

  updateLocationDetails(input: UpdateLocationDetailsInput): Promise<void> {
    return this.connectionsRepository.updateLocationDetails(input);
  }

  updateLocationRating(input: UpdateLocationRatingInput): Promise<void> {
    return this.connectionsRepository.updateLocationRating(input);
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
   * The count `BillingEntitlementsService.canAddLocation` compares against a plan's
   * `max_locations`.
   */
  countActiveUnpausedLocations(tenantId: string): Promise<number> {
    return this.connectionsRepository.countActiveUnpausedLocations(tenantId);
  }

  /**
   * Takes the caller's `tx` (from `withLocationSelectionLock`) so both updates commit atomically
   * with the lock-guarded read that decided them; a crash between them must not leave zero or more
   * than `max_locations` unpaused.
   */
  async applyBillingLocationSelection(
    tx: DrizzleTransaction,
    input: { keepLocationIds: string[]; pauseLocationIds: string[] }
  ): Promise<void> {
    if (input.pauseLocationIds.length > 0) {
      await this.connectionsRepository.setLocationsBillingPaused(tx, input.pauseLocationIds, true);
    }
    if (input.keepLocationIds.length > 0) {
      await this.connectionsRepository.setLocationsBillingPaused(tx, input.keepLocationIds, false);
    }
  }

  /**
   * Serialized per tenant under the same advisory lock as `confirmLocations`, since both mutate
   * which locations are active; otherwise a downgrade webhook racing a manual swap could read the
   * same list, compute conflicting sets and leave more or fewer than `max_locations` unpaused.
   * `existingTx` lets `BillingWebhooksService` fold this into the transaction of the subscription-
   * state write.
   */
  async withLocationSelectionLock<T>(
    tenantId: string,
    fn: (tx: DrizzleTransaction, activeLocations: LocationRow[]) => Promise<T>,
    existingTx?: DrizzleTransaction
  ): Promise<T> {
    const run = async (tx: DrizzleTransaction): Promise<T> => {
      await this.connectionsRepository.acquireLocationConfirmLock(tx, tenantId);
      const activeLocations = await this.connectionsRepository.findLocationsByTenant(
        tenantId,
        LocationStatus.ACTIVE,
        tx
      );
      return fn(tx, activeLocations);
    };

    return existingTx ? run(existingTx) : this.connectionsRepository.transaction(run);
  }

  /**
   * Upgrade back to Paid. `tx`, when given, is used directly so `BillingWebhooksService` can fold
   * it into its outer transaction.
   */
  async clearBillingPauseForTenant(tenantId: string, tx?: DrizzleTransaction): Promise<void> {
    if (tx) {
      return this.connectionsRepository.clearBillingPauseForTenant(tx, tenantId);
    }
    return this.connectionsRepository.transaction(t =>
      this.connectionsRepository.clearBillingPauseForTenant(t, tenantId)
    );
  }

  /**
   * Three subtleties: the location limit is rechecked here under an advisory lock (the caller's
   * pre-check runs outside the transaction and concurrent confirms can both pass it); each sync-run
   * acquisition gets its own savepoint (a duplicate key would otherwise roll back the location rows
   * on a double-click); nothing is enqueued here (BullMQ shares no transaction, so a worker could
   * dequeue an uncommitted `syncRunId`; the caller publishes after commit). An already-running
   * backfill is reported, not thrown, to keep the endpoint idempotent.
   */
  async confirmLocations(input: ConfirmLocationsInput): Promise<ConfirmLocationResult[]> {
    return this.connectionsRepository.transaction(async tx => {
      await this.connectionsRepository.acquireLocationConfirmLock(tx, input.tenantId);

      const active = await this.connectionsRepository.findLocationsByTenant(
        input.tenantId,
        LocationStatus.ACTIVE,
        tx
      );
      const activeExternalIds = new Set(active.map(location => location.externalLocationId));
      let activeCount = active.length;

      const results: ConfirmLocationResult[] = [];

      for (const match of input.locations) {
        const isAlreadyActive = activeExternalIds.has(match.externalLocationId);

        if (!isAlreadyActive && activeCount >= input.maxActiveLocations) {
          throw new LocationLimitExceededError();
        }

        const location = await this.connectionsRepository.upsertLocation(tx, {
          tenantId: input.tenantId,
          providerConnectionId: input.connection.id,
          // Copied off the connection row, never the request body: `locations.provider` is
          // denormalized and no constraint keeps it honest.
          provider: input.connection.provider,
          externalLocationId: match.externalLocationId,
          name: match.name,
          address: match.address,
          phone: match.phone,
          websiteUri: match.websiteUri,
          category: match.category,
        });

        await this.connectionsRepository.attachUserToLocation(tx, {
          userId: input.userId,
          locationId: location.id,
        });

        if (!isAlreadyActive) {
          activeExternalIds.add(match.externalLocationId);
          activeCount += 1;
        }

        results.push(await this.acquireBackfillRun(tx, input.tenantId, location));
      }

      return results;
    });
  }

  /**
   * Acquires a fresh backfill run, or reports the one already holding the partial unique index
   * instead of erroring. Must run inside the caller's transaction: the location-limit recheck under
   * `confirmLocations`' advisory lock is only meaningful if nothing escapes it.
   */
  private async acquireBackfillRun(
    tx: DrizzleTransaction,
    tenantId: string,
    location: LocationRow
  ): Promise<ConfirmLocationResult> {
    const acquire = async (): Promise<SyncRunRow> =>
      tx.transaction(nested =>
        this.reviewSyncRepository.acquireSyncRun(nested, {
          tenantId,
          locationId: location.id,
          trigger: SyncTrigger.BACKFILL,
        })
      );

    try {
      return { location, backfill: await acquire(), backfillAlreadyRunning: false };
    } catch (error) {
      if (!isUniqueViolation(error, SYNC_RUN_RUNNING_INDEX)) {
        throw error;
      }

      // Only the savepoint rolled back, so earlier writes in this transaction survive. Read through
      // `tx`, not the pool: a caller holding an advisory lock would borrow a second connection,
      // risking deadlock on a saturated pool.
      const existing = await this.reviewSyncRepository.findRunningRunForLocation(location.id, tx);

      if (existing) {
        return { location, backfill: existing, backfillAlreadyRunning: true };
      }

      // Nothing is running after all: the blocking run finished between the violation and this
      // read. Reporting `backfillAlreadyRunning` would make the caller skip enqueuing, leaving the
      // location never backfilled or polled. The index is free now, so take it.
      return { location, backfill: await acquire(), backfillAlreadyRunning: false };
    }
  }

  /**
   * Reconnect's backfill-restart path: `disconnect()` never touches `sync_runs` and reactivation
   * does not re-queue, so a location disconnected mid-backfill would have no path to a fresh run.
   * Filters to incomplete locations itself; a genuinely live run is left alone rather than
   * duplicated.
   */
  async restartIncompleteBackfills(input: {
    tenantId: string;
    locations: LocationRow[];
  }): Promise<ConfirmLocationResult[]> {
    const incomplete = input.locations.filter(
      location => location.onboardingBackfillCompletedAt === null
    );
    if (incomplete.length === 0) {
      return [];
    }

    return this.connectionsRepository.transaction(async tx => {
      const results: ConfirmLocationResult[] = [];
      for (const location of incomplete) {
        results.push(await this.acquireBackfillRun(tx, input.tenantId, location));
      }
      return results;
    });
  }

  /**
   * Flips locations to `inactive` and records the owner's intent on the connection row; never
   * deletes (see `ConnectionsRepository.deactivateLocationsForConnection` for the cascade).
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
   * Only for a same-account reconnect; a brand-new connection has no prior locations to reactivate.
   */
  async reactivateLocationsForConnection(connectionId: string): Promise<LocationRow[]> {
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
