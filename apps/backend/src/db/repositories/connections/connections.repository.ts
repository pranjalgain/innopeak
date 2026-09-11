import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { ReviewProvider } from '@common/enums/review-provider.enum';
import { SyncHealthStatus } from '@common/enums/sync-health-status.enum';
import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';

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

const CONNECTION_COLUMNS = {
  id: schema.reviewProviderConnections.id,
  tenantId: schema.reviewProviderConnections.tenantId,
  connectedByUserId: schema.reviewProviderConnections.connectedByUserId,
  provider: schema.reviewProviderConnections.provider,
  providerAccountId: schema.reviewProviderConnections.providerAccountId,
  credentialReference: schema.reviewProviderConnections.credentialReference,
  tokenExpiresAt: schema.reviewProviderConnections.tokenExpiresAt,
  status: schema.reviewProviderConnections.status,
  disconnectedAt: schema.reviewProviderConnections.disconnectedAt,
  createdAt: schema.reviewProviderConnections.createdAt,
} as const;

const LOCATION_COLUMNS = {
  id: schema.locations.id,
  tenantId: schema.locations.tenantId,
  providerConnectionId: schema.locations.providerConnectionId,
  provider: schema.locations.provider,
  externalLocationId: schema.locations.externalLocationId,
  name: schema.locations.name,
  address: schema.locations.address,
  status: schema.locations.status,
  lastSyncedAt: schema.locations.lastSyncedAt,
  lastSyncStatus: schema.locations.lastSyncStatus,
  lastSyncError: schema.locations.lastSyncError,
  onboardingBackfillCompletedAt: schema.locations.onboardingBackfillCompletedAt,
  lastReviewSyncedAt: schema.locations.lastReviewSyncedAt,
  createdAt: schema.locations.createdAt,
} as const;

/**
 * Mechanical Drizzle queries over `review_provider_connections`, `locations` and
 * `user_locations` — one tightly-related cluster, no composition and no transaction ownership
 * (that is ConnectionsDbService's job, per module-structure.md).
 *
 * `sync_runs`, `reviews` and `review_responses` deliberately live in the `review-sync` domain
 * instead, so exactly one repository writes each table — the connections overview calls out "do
 * not end up with two repositories writing the same table" specifically about `sync_runs`.
 */
@Injectable()
export class ConnectionsRepository {
  constructor(private readonly dbService: DBService) {}

  transaction<T>(fn: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
    return this.dbService.db.transaction(fn);
  }

  /**
   * The tenant's *live* connection: a non-disconnected row wins over any disconnected one, then
   * most recent first.
   *
   * MVP's one-connection rule means one **active** connection. A tenant who disconnects and then
   * reconnects with a different Google account legitimately has two rows — the old one, kept as
   * an inactive record so its locations and review history survive, and the new one. Ordering
   * only by `created_at` would hand back the dead row forever and make switching accounts
   * impossible.
   */
  async findConnectionByTenant(tenantId: string): Promise<ProviderConnectionRow | null> {
    const rows = await this.dbService.db
      .select(CONNECTION_COLUMNS)
      .from(schema.reviewProviderConnections)
      .where(eq(schema.reviewProviderConnections.tenantId, tenantId))
      .orderBy(
        // NULLS FIRST puts live connections (disconnected_at IS NULL) ahead of disconnected ones.
        sql`${schema.reviewProviderConnections.disconnectedAt} ASC NULLS FIRST`,
        desc(schema.reviewProviderConnections.createdAt)
      )
      .limit(1);

    return (rows[0] as ProviderConnectionRow | undefined) ?? null;
  }

  /**
   * Upsert on `(tenant_id, provider, provider_account_id)` — PLAN.md §8.8's requirement that a
   * reconnect after `needs_reauth` be the *same* write as a first connect, not a blind insert
   * that trips the unique index.
   *
   * `disconnected_at` is reset to null on conflict: reconnecting is precisely the act that
   * withdraws a previous disconnect, and leaving it set would make a live connection read as
   * disconnected forever.
   */
  async upsertConnection(
    tx: DrizzleTransaction,
    input: UpsertConnectionInput
  ): Promise<ProviderConnectionRow> {
    const rows = await tx
      .insert(schema.reviewProviderConnections)
      .values({
        tenantId: input.tenantId,
        connectedByUserId: input.connectedByUserId,
        provider: ReviewProvider.GOOGLE,
        providerAccountId: input.providerAccountId,
        credentialReference: input.credentialReference,
        tokenExpiresAt: input.tokenExpiresAt?.toISOString() ?? null,
        status: ReviewProviderConnectionStatus.ACTIVE,
      })
      .onConflictDoUpdate({
        target: [
          schema.reviewProviderConnections.tenantId,
          schema.reviewProviderConnections.provider,
          schema.reviewProviderConnections.providerAccountId,
        ],
        set: {
          credentialReference: sql`excluded.credential_reference`,
          tokenExpiresAt: sql`excluded.token_expires_at`,
          connectedByUserId: sql`excluded.connected_by_user_id`,
          status: ReviewProviderConnectionStatus.ACTIVE,
          disconnectedAt: null,
          // No `set_updated_at` trigger exists in this schema — every UPDATE writes it by hand.
          updatedAt: sql`now()`,
        },
      })
      .returning(CONNECTION_COLUMNS);

    const row = rows[0];
    if (!row) {
      throw new Error('Failed to upsert review provider connection');
    }
    return row as ProviderConnectionRow;
  }

  async updateConnectionStatus(
    connectionId: string,
    status: ReviewProviderConnectionStatus
  ): Promise<void> {
    await this.dbService.db
      .update(schema.reviewProviderConnections)
      .set({ status, updatedAt: sql`now()` })
      .where(eq(schema.reviewProviderConnections.id, connectionId));
  }

  async updateTokenExpiry(connectionId: string, tokenExpiresAt: Date): Promise<void> {
    await this.dbService.db
      .update(schema.reviewProviderConnections)
      .set({ tokenExpiresAt: tokenExpiresAt.toISOString(), updatedAt: sql`now()` })
      .where(eq(schema.reviewProviderConnections.id, connectionId));
  }

  async markConnectionDisconnected(tx: DrizzleTransaction, connectionId: string): Promise<void> {
    await tx
      .update(schema.reviewProviderConnections)
      .set({ disconnectedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(schema.reviewProviderConnections.id, connectionId));
  }

  /**
   * Joined through `user_locations` rather than filtered on `locations.tenant_id` alone. Identical
   * results while a tenant has one location and every user is attached to it, and already correct
   * on the day a member is scoped to one store of several.
   */
  async findLocationsForUser(userId: string, status?: LocationStatus): Promise<LocationRow[]> {
    const conditions = [eq(schema.userLocations.userId, userId)];
    if (status) {
      conditions.push(eq(schema.locations.status, status));
    }

    return this.dbService.db
      .select(LOCATION_COLUMNS)
      .from(schema.locations)
      .innerJoin(schema.userLocations, eq(schema.userLocations.locationId, schema.locations.id))
      .where(and(...conditions))
      .orderBy(schema.locations.createdAt) as Promise<LocationRow[]>;
  }

  /** Tenant-scoped by design — see LOCATION_NOT_FOUND in the API reference: another tenant's id
   * must 404, not 403, so it cannot be used to probe whether an id exists elsewhere. */
  async findLocationByIdForTenant(
    locationId: string,
    tenantId: string
  ): Promise<LocationRow | null> {
    const rows = await this.dbService.db
      .select(LOCATION_COLUMNS)
      .from(schema.locations)
      .where(and(eq(schema.locations.id, locationId), eq(schema.locations.tenantId, tenantId)))
      .limit(1);

    return (rows[0] as LocationRow | undefined) ?? null;
  }

  /**
   * `tx` is optional and only meant for a caller already inside `confirmLocation`'s transaction
   * (see `acquireLocationConfirmLock`) — passing it there is what makes the read happen after
   * this transaction's own advisory-lock wait, rather than against a separate pooled connection.
   */
  async findLocationsByTenant(
    tenantId: string,
    status?: LocationStatus,
    tx?: DrizzleTransaction
  ): Promise<LocationRow[]> {
    const conditions = [eq(schema.locations.tenantId, tenantId)];
    if (status) {
      conditions.push(eq(schema.locations.status, status));
    }

    return (tx ?? this.dbService.db)
      .select(LOCATION_COLUMNS)
      .from(schema.locations)
      .where(and(...conditions))
      .orderBy(schema.locations.createdAt) as Promise<LocationRow[]>;
  }

  /**
   * Serializes `ConnectionsService.confirmLocation` per tenant — closes a TOCTOU race the schema
   * has no constraint for. `MAX_ACTIVE_LOCATIONS` (MVP's one-active-location rule) is enforced by
   * counting existing rows before inserting, but under READ COMMITTED two concurrent confirms for
   * *different* `externalLocationId`s each see zero active locations (there is nothing yet to
   * lock against), both pass the count check, and both commit — silently doubling a tenant past
   * the limit. An advisory lock closes it even with nothing to select `FOR UPDATE` against: the
   * second transaction blocks here until the first commits or rolls back, so its own count check
   * runs against the first one's already-committed result.
   *
   * Transaction-scoped (`_xact_`): released automatically on commit or rollback, never held past
   * this transaction, so no separate unlock call is needed and a crash cannot leak it.
   */
  async acquireLocationConfirmLock(tx: DrizzleTransaction, tenantId: string): Promise<void> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('connections:confirm-location'), hashtext(${tenantId}))`
    );
  }

  /** Idempotent per the unique index `(provider_connection_id, external_location_id)`. Reactivates
   * on conflict, which is what makes reconnect reuse the tenant's existing location row rather
   * than creating a second one. */
  async upsertLocation(tx: DrizzleTransaction, input: UpsertLocationInput): Promise<LocationRow> {
    const rows = await tx
      .insert(schema.locations)
      .values({
        tenantId: input.tenantId,
        providerConnectionId: input.providerConnectionId,
        provider: input.provider,
        externalLocationId: input.externalLocationId,
        name: input.name,
        address: input.address,
        status: LocationStatus.ACTIVE,
      })
      .onConflictDoUpdate({
        target: [schema.locations.providerConnectionId, schema.locations.externalLocationId],
        set: {
          name: sql`excluded.name`,
          address: sql`excluded.address`,
          status: LocationStatus.ACTIVE,
          updatedAt: sql`now()`,
          // onboarding_backfill_completed_at is deliberately NOT reset: a location that has
          // already been backfilled should not be re-gated out of live polling by a reconnect.
        },
      })
      .returning(LOCATION_COLUMNS);

    const row = rows[0];
    if (!row) {
      throw new Error('Failed to upsert location');
    }
    return row as LocationRow;
  }

  async attachUserToLocation(
    tx: DrizzleTransaction,
    input: { userId: string; locationId: string }
  ): Promise<void> {
    await tx
      .insert(schema.userLocations)
      .values({ userId: input.userId, locationId: input.locationId })
      .onConflictDoNothing({
        target: [schema.userLocations.userId, schema.userLocations.locationId],
      });
  }

  /**
   * Disconnect flips locations to `inactive`; it never DELETEs. `locations.provider_connection_id`
   * cascades, and `reviews`/`sync_runs` cascade from `locations`, so a delete here would take the
   * tenant's entire review history with it — PLAN.md §8.15.
   */
  async deactivateLocationsForConnection(
    tx: DrizzleTransaction,
    connectionId: string
  ): Promise<string[]> {
    const rows = await tx
      .update(schema.locations)
      .set({ status: LocationStatus.INACTIVE, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.locations.providerConnectionId, connectionId),
          eq(schema.locations.status, LocationStatus.ACTIVE)
        )
      )
      .returning({ id: schema.locations.id });

    return rows.map(row => row.id);
  }

  /**
   * The reconnect counterpart to `deactivateLocationsForConnection` — a status flip only, same
   * shape. `onboarding_backfill_completed_at` is left untouched, same reasoning as
   * `upsertLocation`'s `ON CONFLICT` branch: a location already backfilled should not be re-gated
   * out of live polling, or re-queued for another backfill, just because the owner reconnected.
   */
  async reactivateLocationsForConnection(
    tx: DrizzleTransaction,
    connectionId: string
  ): Promise<string[]> {
    const rows = await tx
      .update(schema.locations)
      .set({ status: LocationStatus.ACTIVE, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.locations.providerConnectionId, connectionId),
          eq(schema.locations.status, LocationStatus.INACTIVE)
        )
      )
      .returning({ id: schema.locations.id });

    return rows.map(row => row.id);
  }

  /** Set by the backfill job, not the HTTP handler — this column is what un-gates live polling. */
  async markBackfillCompleted(locationId: string): Promise<void> {
    await this.dbService.db
      .update(schema.locations)
      .set({ onboardingBackfillCompletedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.locations.id, locationId),
          isNull(schema.locations.onboardingBackfillCompletedAt)
        )
      );
  }

  async updateSyncSnapshot(
    locationId: string,
    input: { status: SyncHealthStatus; error: string | null }
  ): Promise<void> {
    await this.dbService.db
      .update(schema.locations)
      .set({
        lastSyncedAt: sql`now()`,
        lastSyncStatus: input.status,
        lastSyncError: input.error,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.locations.id, locationId));
  }

  /**
   * Every location a `review-poll` job may be enqueued for, per PLAN.md §8.2's gate: `active`,
   * backfilled, and its connection not `needs_reauth` — the last one isn't in §8.2 itself, but
   * without it a dead grant gets re-polled into a fresh 401 every 15 minutes until someone notices
   * `last_sync_error` in the UI. `deactivateLocationsForConnection` already flips a disconnected
   * connection's locations to `inactive`, so `disconnected_at` needs no separate check here.
   */
  async findLocationsDueForPoll(): Promise<PollableLocationRow[]> {
    const rows = await this.dbService.db
      .select({
        tenantId: schema.locations.tenantId,
        locationId: schema.locations.id,
        connectionId: schema.reviewProviderConnections.id,
        externalAccountId: schema.reviewProviderConnections.providerAccountId,
        externalLocationId: schema.locations.externalLocationId,
      })
      .from(schema.locations)
      .innerJoin(
        schema.reviewProviderConnections,
        eq(schema.reviewProviderConnections.id, schema.locations.providerConnectionId)
      )
      .where(
        and(
          eq(schema.locations.status, LocationStatus.ACTIVE),
          isNotNull(schema.locations.onboardingBackfillCompletedAt),
          eq(schema.reviewProviderConnections.status, ReviewProviderConnectionStatus.ACTIVE)
        )
      );

    return rows;
  }

  /**
   * Monotonic on purpose — `WHERE last_review_synced_at IS NULL OR < cursor` never lets the
   * high-water mark move backward. Without the guard, a run whose own view of "newest seen" was
   * computed from a partial page set (a crash mid-run, a reclaim) could regress the cursor and
   * make a later poll re-walk pages a previous run already advanced past.
   */
  async advanceLastReviewSyncedAt(locationId: string, cursor: string): Promise<void> {
    await this.dbService.db
      .update(schema.locations)
      .set({ lastReviewSyncedAt: cursor, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.locations.id, locationId),
          or(
            isNull(schema.locations.lastReviewSyncedAt),
            lt(schema.locations.lastReviewSyncedAt, cursor)
          )
        )
      );
  }
}
