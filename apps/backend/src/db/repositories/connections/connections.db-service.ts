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
  UpsertConnectionInput,
} from './types/connections.type';

import { ReviewSyncRepository } from '../review-sync/review-sync.repository';
import type { SyncRunRow } from '../review-sync/types/review-sync.type';

/** The index Postgres names on the 23505 a concurrent second backfill raises — 0004_reviews.sql. */
const SYNC_RUN_RUNNING_INDEX = 'idx_sync_runs_location_id_running';

/**
 * Thrown from inside `confirmLocation`'s transaction when the authoritative, lock-held recheck
 * of `maxActiveLocations` fails. `ConnectionsService.confirmLocation`'s own pre-check
 * (`assertLocationLimit`) already rejects the common case early and cheaply, before a
 * transaction or advisory lock is even opened — this is the race-safe backstop for the case two
 * concurrent confirms both passed that pre-check. Caught by the service and mapped to the same
 * `ConflictException` the pre-check throws.
 */
export class LocationLimitExceededError extends Error {}

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

  /** See `ConnectionsRepository.countActiveUnpausedLocations` — the count
   *  `BillingEntitlementsService.canAddLocation` compares against a plan's `max_locations`. */
  countActiveUnpausedLocations(tenantId: string): Promise<number> {
    return this.connectionsRepository.countActiveUnpausedLocations(tenantId);
  }

  /**
   * Atomically pauses one set of a tenant's locations and unpauses another — the primitive behind
   * both `BillingEntitlementsService.enforceLocationLimitOnDowngrade` (auto-pick on downgrade) and
   * `.setActiveLocationForPlan` (the owner's manual swap). Takes the caller's own `tx` (from
   * `withLocationSelectionLock`, below) rather than opening one itself, so both updates commit
   * atomically with the lock-guarded read that decided them — a crash between the two updates can
   * never leave the tenant with either zero or more-than-`max_locations` unpaused locations at
   * once, and the whole read-decide-write span is what the lock actually protects.
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
   * Read-decide-write for "which of a tenant's active locations stay unpaused", serialized per
   * tenant under the same advisory lock `confirmLocations` uses (`acquireLocationConfirmLock`) —
   * both mutate the same "which locations are active for this tenant" state, so they must
   * serialize against each other too, not just against themselves. Without this lock, a downgrade
   * webhook and a manual `setActiveLocationForPlan` call (or two of either) racing for the same
   * tenant could each read the same pre-change location list, compute conflicting keep/pause sets,
   * and both commit — leaving more or fewer than `max_locations` unpaused.
   *
   * `existingTx`, when given, is used directly instead of opening a new transaction — lets
   * `BillingWebhooksService` fold this into the same transaction as the subscription-state write
   * that triggered it (see that class's own doc comment on why webhook writes must commit
   * atomically together).
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

  /** Upgrade back to Paid — see `ConnectionsRepository.clearBillingPauseForTenant`. `tx`, when
   *  given, is used directly instead of opening a new transaction — see `withLocationSelectionLock`
   *  for why (`BillingWebhooksService` folding this into its own outer transaction). */
  async clearBillingPauseForTenant(tenantId: string, tx?: DrizzleTransaction): Promise<void> {
    if (tx) {
      return this.connectionsRepository.clearBillingPauseForTenant(tx, tenantId);
    }
    return this.connectionsRepository.transaction(t =>
      this.connectionsRepository.clearBillingPauseForTenant(t, tenantId)
    );
  }

  /**
   * The module's one real transaction: upsert each confirmed location, attach the user, acquire
   * a backfill run per location. Three subtleties, all easy to get wrong and all expensive:
   *
   *  1. **The location limit is rechecked here, under an advisory lock, not just by the caller's
   *     pre-check.** `ConnectionsService.assertLocationLimit` runs before this transaction even
   *     opens — a cheap, non-authoritative fast path. Under READ COMMITTED, two concurrent
   *     confirm requests can both read the same starting count (there is nothing yet to lock
   *     against) and both pass that pre-check, since neither has committed anything for the other
   *     to see. `acquireLocationConfirmLock` closes it: the second transaction blocks on the lock
   *     until the first commits or rolls back, so its own recheck here runs against the first
   *     one's already-committed result. The count is tracked and advanced in-memory as this loop
   *     confirms each location, so a batch of N new locations is checked against the limit
   *     incrementally rather than only once against the pre-loop snapshot.
   *  2. **Each location's sync-run acquisition is wrapped in its own savepoint.** A duplicate-key
   *     on the partial unique index would otherwise abort the *whole* transaction, so an
   *     impatient owner double-clicking Continue would get "backfill already running" **and no
   *     location rows at all** — everything they actually asked for silently rolled back.
   *  3. **Nothing is enqueued here.** BullMQ and Postgres share no transaction, so publishing
   *     inside this block lets a worker dequeue a `syncRunId` for a row that has not committed,
   *     find nothing, and mark the run failed. The caller publishes after commit, once per
   *     confirmed location.
   *
   * An already-running backfill is reported rather than thrown, so the endpoint can stay
   * idempotent — the owner gets 201 and the ids they need to start polling, which is what they
   * wanted anyway.
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
          // Copied off the connection row, never from the request body: `locations.provider` is
          // denormalized and no constraint keeps it honest.
          provider: input.connection.provider,
          externalLocationId: match.externalLocationId,
          name: match.name,
          address: match.address,
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
   * Acquires a fresh backfill run for `location`, or reports the one already holding the partial
   * unique index (`UNIQUE (location_id) WHERE status = 'running'`) instead of erroring — shared by
   * `confirmLocations` (a location the owner just selected) and `restartIncompleteBackfills` (a
   * location reactivated by reconnect whose backfill never finished). Must run inside the caller's
   * own transaction: `confirmLocations` holds this tenant's advisory lock for the duration, and a
   * location-limit recheck under that lock is only meaningful if nothing here escapes it.
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

      // The savepoint rolled back, not the outer transaction — any earlier writes in this same
      // transaction survive. Read through `tx`, not the pool: a caller holding an advisory lock
      // for the duration (`confirmLocations`) would otherwise borrow a second connection here, a
      // needless way to deadlock against a saturated pool.
      const existing = await this.reviewSyncRepository.findRunningRunForLocation(location.id, tx);

      if (existing) {
        return { location, backfill: existing, backfillAlreadyRunning: true };
      }

      // Nothing is running after all: the blocking run finished between the constraint violation
      // and this read. Reporting `backfillAlreadyRunning` here would be a lie with teeth — the
      // caller skips enqueuing on that flag, so the location would sit active, never backfilled,
      // with `onboarding_backfill_completed_at` NULL forever, which also excludes it from
      // `findLocationsDueForPoll`. Nothing would ever retry it and no error would surface. The
      // index is free now, so simply take it.
      return { location, backfill: await acquire(), backfillAlreadyRunning: false };
    }
  }

  /**
   * Reconnect's backfill-restart path. `disconnect()` never touches `sync_runs`, and
   * `reactivateLocationsForConnection` deliberately never re-queues a location that already
   * finished its backfill (see its own doc comment) — so without this, a location whose backfill
   * was still in flight, or had failed, when the owner disconnected reactivates with no path left
   * to ever acquire a fresh run: `confirmLocations` is the only other caller of `acquireSyncRun`,
   * and nothing calls it for an already-active, already-confirmed location. The frontend then polls
   * the same pre-disconnect `sync_runs` row forever — wedged in `running`, or terminally `error`
   * with no retry path that creates a new one.
   *
   * Filters to incomplete locations itself so callers can pass every reactivated location without
   * checking first. Each acquisition reuses `acquireBackfillRun`'s stale-reclaim/collision handling,
   * so a genuinely live run (a backfill that survived the disconnect and is still importing) is
   * correctly left alone rather than duplicated.
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
