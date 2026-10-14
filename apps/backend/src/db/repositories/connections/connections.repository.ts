import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { MESSAGES } from '@common/constants/messages.constants';
import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { ReviewProvider } from '@common/enums/review-provider.enum';
import { SyncHealthStatus } from '@common/enums/sync-health-status.enum';
import { toStoredMessage } from '@common/i18n/message-registry';
import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';

import type {
  LocationRow,
  PollableLocationRow,
  ProviderConnectionRow,
  UpdateLocationDetailsInput,
  UpsertConnectionInput,
  UpsertLocationInput,
} from './types/connections.type';

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
  phone: schema.locations.phone,
  websiteUri: schema.locations.websiteUri,
  detailsRefreshedAt: schema.locations.detailsRefreshedAt,
  reviewsReconciledAt: schema.locations.reviewsReconciledAt,
  status: schema.locations.status,
  lastSyncedAt: schema.locations.lastSyncedAt,
  lastSyncStatus: schema.locations.lastSyncStatus,
  lastSyncError: schema.locations.lastSyncError,
  onboardingBackfillCompletedAt: schema.locations.onboardingBackfillCompletedAt,
  lastReviewSyncedAt: schema.locations.lastReviewSyncedAt,
  billingPausedAt: schema.locations.billingPausedAt,
  createdAt: schema.locations.createdAt,
} as const;

/**
 * Mechanical queries over connections, locations and user_locations, with no composition or
 * transactions. `sync_runs`, `reviews` and `review_responses` live in `review-sync` so exactly one
 * repository writes each table.
 */
@Injectable()
export class ConnectionsRepository {
  constructor(private readonly dbService: DBService) {}

  transaction<T>(fn: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
    return this.dbService.db.transaction(fn);
  }

  /**
   * A non-disconnected row wins over a disconnected one, then most recent first. Reconnecting with
   * a different Google account leaves two rows (the old one kept so its locations and history
   * survive); ordering by `created_at` alone would return the dead row forever.
   */
  async findConnectionByTenant(tenantId: string): Promise<ProviderConnectionRow | null> {
    const rows = await this.dbService.db
      .select(CONNECTION_COLUMNS)
      .from(schema.reviewProviderConnections)
      .where(eq(schema.reviewProviderConnections.tenantId, tenantId))
      .orderBy(
        sql`${schema.reviewProviderConnections.disconnectedAt} ASC NULLS FIRST`,
        desc(schema.reviewProviderConnections.createdAt)
      )
      .limit(1);

    return (rows[0] as ProviderConnectionRow | undefined) ?? null;
  }

  /**
   * Upsert so a reconnect after `needs_reauth` is the same write as a first connect.
   * `disconnected_at` resets to null on conflict: reconnecting withdraws the earlier disconnect.
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
          // No `set_updated_at` trigger exists in this schema: every UPDATE writes it by hand.
          updatedAt: sql`now()`,
        },
      })
      .returning(CONNECTION_COLUMNS);

    const row = rows[0];
    if (!row) {
      throw new Error(MESSAGES.CONNECTIONS.FAILED_TO_UPSERT_CONNECTION);
    }
    return row as ProviderConnectionRow;
  }

  /**
   * `true` only when this call moved the connection into `needs_reauth`; already there (many failing jobs report the same dead grant)
   * is `false`, so the owner is told once per incident rather than once per failure.
   */
  async markNeedsReauth(connectionId: string): Promise<boolean> {
    const rows = await this.dbService.db
      .update(schema.reviewProviderConnections)
      .set({ status: ReviewProviderConnectionStatus.NEEDS_REAUTH, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.reviewProviderConnections.id, connectionId),
          ne(schema.reviewProviderConnections.status, ReviewProviderConnectionStatus.NEEDS_REAUTH)
        )
      )
      .returning({ id: schema.reviewProviderConnections.id });

    return rows.length > 0;
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

  /** Stamped whether or not the comparison succeeded, so a location Google keeps refusing costs one try a day. */
  async markReviewsReconciled(locationId: string): Promise<void> {
    await this.dbService.db
      .update(schema.locations)
      .set({ reviewsReconciledAt: sql`now()` })
      .where(eq(schema.locations.id, locationId));
  }

  /** A failed re-read still counts as one, so the poll tries again in a day rather than on every tick. */
  async markLocationDetailsAttempted(locationId: string): Promise<void> {
    await this.dbService.db
      .update(schema.locations)
      .set({ detailsRefreshedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(schema.locations.id, locationId));
  }

  /** Stamps `details_refreshed_at` too, so the poll knows when it last asked. */
  async updateLocationDetails(input: UpdateLocationDetailsInput): Promise<void> {
    await this.dbService.db
      .update(schema.locations)
      .set({
        name: input.name,
        address: input.address,
        phone: input.phone,
        websiteUri: input.websiteUri,
        detailsRefreshedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.locations.id, input.locationId));
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
   * Joined through `user_locations` rather than filtered on `locations.tenant_id`: identical today,
   * and already correct once a member is scoped to one store of several.
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
      .orderBy(schema.locations.createdAt, schema.locations.id) as Promise<LocationRow[]>;
  }

  /**
   * Tenant-scoped by design: another tenant's id must 404, not 403, so it cannot probe whether an
   * id exists.
   */
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
   * `tx` only for a caller already inside `confirmLocation`'s transaction, so the read happens
   * after its advisory-lock wait rather than on a separate pooled connection.
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
      .orderBy(schema.locations.createdAt, schema.locations.id) as Promise<LocationRow[]>;
  }

  /**
   * Serializes `confirmLocation` per tenant, closing a TOCTOU race the schema has no constraint
   * for: under READ COMMITTED, concurrent confirms each see zero active locations and both pass the
   * count check. An advisory lock works with nothing to `FOR UPDATE` against. Transaction-scoped
   * (`_xact_`), so it is released on commit/rollback and cannot leak.
   */
  async acquireLocationConfirmLock(tx: DrizzleTransaction, tenantId: string): Promise<void> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('connections:confirm-location'), hashtext(${tenantId}))`
    );
  }

  /**
   * Idempotent per the unique index `(provider_connection_id, external_location_id)`; reactivates
   * on conflict so reconnect reuses the existing location row.
   */
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
        phone: input.phone,
        websiteUri: input.websiteUri,
        detailsRefreshedAt: sql`now()`,
        status: LocationStatus.ACTIVE,
      })
      .onConflictDoUpdate({
        target: [schema.locations.providerConnectionId, schema.locations.externalLocationId],
        set: {
          name: sql`excluded.name`,
          address: sql`excluded.address`,
          phone: sql`excluded.phone`,
          websiteUri: sql`excluded.website_uri`,
          detailsRefreshedAt: sql`now()`,
          status: LocationStatus.ACTIVE,
          updatedAt: sql`now()`,
          // onboarding_backfill_completed_at is deliberately NOT reset: an already-backfilled
          // location should not be re-gated out of live polling by a reconnect.
        },
      })
      .returning(LOCATION_COLUMNS);

    const row = rows[0];
    if (!row) {
      throw new Error(MESSAGES.CONNECTIONS.FAILED_TO_UPSERT_LOCATION);
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
   * Never DELETEs: `locations.provider_connection_id` cascades and `reviews`/`sync_runs` cascade
   * from `locations`, so a delete would take the tenant's whole review history.
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
   * `onboarding_backfill_completed_at` is left untouched, as in `upsertLocation`. Returns full rows
   * because `restartIncompleteBackfills` needs that column to tell which locations still need a
   * fresh backfill.
   */
  async reactivateLocationsForConnection(
    tx: DrizzleTransaction,
    connectionId: string
  ): Promise<LocationRow[]> {
    const rows = await tx
      .update(schema.locations)
      .set({ status: LocationStatus.ACTIVE, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.locations.providerConnectionId, connectionId),
          eq(schema.locations.status, LocationStatus.INACTIVE)
        )
      )
      .returning(LOCATION_COLUMNS);

    return rows as LocationRow[];
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
        lastSyncError: toStoredMessage(input.error),
        updatedAt: sql`now()`,
      })
      .where(eq(schema.locations.id, locationId));
  }

  /**
   * Locations a `review-poll` job may be enqueued for: `active`, backfilled, and connection not
   * `needs_reauth` (a dead grant would be re-polled into a 401 every 15 minutes). A disconnected
   * connection's locations are already `inactive`, so `disconnected_at` needs no check.
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
      .innerJoin(schema.tenants, eq(schema.tenants.id, schema.locations.tenantId))
      .where(
        and(
          eq(schema.locations.status, LocationStatus.ACTIVE),
          isNotNull(schema.locations.onboardingBackfillCompletedAt),
          eq(schema.reviewProviderConnections.status, ReviewProviderConnectionStatus.ACTIVE),
          // A suspended (including erasure grace) or erased tenant must not keep producing reviews,
          // AI drafts and notification emails.
          notInArray(schema.tenants.status, [TenantStatus.SUSPENDED, TenantStatus.ERASED]),
          // Billing-paused locations (over the plan's `max_locations`) are excluded from polling.
          isNull(schema.locations.billingPausedAt)
        )
      );

    return rows;
  }

  /**
   * `status = 'active' AND billing_paused_at IS NULL`: the count `BillingEntitlementsService`
   * compares against `max_locations`. Paused locations don't count; they are already excluded from
   * active use.
   */
  async countActiveUnpausedLocations(tenantId: string): Promise<number> {
    const rows = await this.dbService.db
      .select({ value: count() })
      .from(schema.locations)
      .where(
        and(
          eq(schema.locations.tenantId, tenantId),
          eq(schema.locations.status, LocationStatus.ACTIVE),
          isNull(schema.locations.billingPausedAt)
        )
      );

    return rows[0]?.value ?? 0;
  }

  /**
   * Batch flip for both sides of a downgrade/manual swap. An empty array must be skipped by the
   * caller (`IN ()` is invalid SQL).
   */
  async setLocationsBillingPaused(
    tx: DrizzleTransaction,
    locationIds: string[],
    paused: boolean
  ): Promise<void> {
    await tx
      .update(schema.locations)
      .set({ billingPausedAt: paused ? sql`now()` : null, updatedAt: sql`now()` })
      .where(inArray(schema.locations.id, locationIds));
  }

  /** Upgrade back to Paid — Paid has no location cap, so nothing stays paused. */
  async clearBillingPauseForTenant(tx: DrizzleTransaction, tenantId: string): Promise<void> {
    await tx
      .update(schema.locations)
      .set({ billingPausedAt: null, updatedAt: sql`now()` })
      .where(
        and(eq(schema.locations.tenantId, tenantId), isNotNull(schema.locations.billingPausedAt))
      );
  }

  /**
   * Monotonic on purpose: a run whose view of "newest seen" came from a partial page set (crash
   * mid-run, a reclaim) could otherwise regress the cursor and make a later poll re-walk pages.
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
