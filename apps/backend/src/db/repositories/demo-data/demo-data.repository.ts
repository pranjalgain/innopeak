import { EscalationReason } from '@common/enums/escalation-reason.enum';
import { LocationStatus } from '@common/enums/location-status.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import { ReviewProvider } from '@common/enums/review-provider.enum';
import { ReviewSentiment } from '@common/enums/review-sentiment.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { SyncHealthStatus } from '@common/enums/sync-health-status.enum';
import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

export interface InsertDemoConnectionInput {
  tenantId: string;
  connectedByUserId: string;
  providerAccountId: string;
  credentialReference: string;
}

export interface InsertDemoLocationInput {
  tenantId: string;
  providerConnectionId: string;
  externalLocationId: string;
  name: string;
  address: string | null;
}

export interface InsertDemoReviewInput {
  tenantId: string;
  locationId: string;
  externalReviewId: string;
  externalReviewerId: string | null;
  rating: number;
  reviewText: string | null;
  reviewerName: string | null;
  reviewedAt: string;
  sentiment: ReviewSentiment | null;
  classification: ReviewClassification;
  escalationReason: EscalationReason | null;
  status: ReviewStatus;
}

/**
 * Mechanical inserts for the dev-only "populate a fresh signup with demo data" feature — see
 * `DemoDataDbService`. Deliberately its own domain rather than reusing `ConnectionsRepository`/
 * `ReviewSyncRepository`: this writes fields those repositories intentionally never expose
 * (`classification`/`sentiment`/`escalationReason` on insert, which `ReviewSyncRepository
 * .upsertReview` omits on purpose so a retried real sync can never clobber human triage — a
 * distinction that doesn't apply to fabricated demo rows, which is precisely why this needs its
 * own method rather than a flag bolted onto the production one).
 */
@Injectable()
export class DemoDataRepository {
  constructor(private readonly dbService: DBService) {}

  transaction<T>(fn: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
    return this.dbService.db.transaction(fn);
  }

  async insertConnection(
    tx: DrizzleTransaction,
    input: InsertDemoConnectionInput
  ): Promise<{ id: string }> {
    const rows = await tx
      .insert(schema.reviewProviderConnections)
      .values({
        tenantId: input.tenantId,
        connectedByUserId: input.connectedByUserId,
        provider: ReviewProvider.GOOGLE,
        providerAccountId: input.providerAccountId,
        credentialReference: input.credentialReference,
        tokenExpiresAt: null,
        status: ReviewProviderConnectionStatus.ACTIVE,
      })
      .returning({ id: schema.reviewProviderConnections.id });

    const row = rows[0];
    if (!row) throw new Error('Failed to insert demo review provider connection');
    return row;
  }

  /**
   * `onboardingBackfillCompletedAt` is stamped, exactly like a real finished backfill, because it
   * is what the onboarding flow reads as "this location is done." An earlier version left it NULL
   * to keep the location outside `CronService.pollDueLocations`'s reach (that query requires the
   * column to be non-null, and this row's `credentialReference` is fabricated). That traded a
   * small, delayed problem for a much worse immediate one: `useOnboardingConnectFlow.resume()`
   * treats any active location with a NULL stamp as still importing, and advances to "done" only
   * on `livePollingEnabled`, which is literally `onboardingBackfillCompletedAt !== null`. A fresh
   * signup redirected to /onboarding/connect therefore sat on "Importing your review history…"
   * forever, with no progress, no error, and no way out — the give-up timer never fires either,
   * since a location with no `sync_runs` row never reports `isStale`.
   *
   * The remaining trade-off is deliberate and much cheaper: if the worker process is running, a
   * poll will eventually try to resolve this fake credential, fail, and mark the connection
   * `needs_reauth` — which renders the dashboard with a reconnect banner rather than breaking it
   * (see `ConnectionGuard`). A dev-only cosmetic annoyance, against a hard dead end on the primary
   * signup path.
   */
  async insertLocation(
    tx: DrizzleTransaction,
    input: InsertDemoLocationInput
  ): Promise<{ id: string }> {
    const rows = await tx
      .insert(schema.locations)
      .values({
        tenantId: input.tenantId,
        providerConnectionId: input.providerConnectionId,
        provider: ReviewProvider.GOOGLE,
        externalLocationId: input.externalLocationId,
        name: input.name,
        address: input.address,
        status: LocationStatus.ACTIVE,
        lastSyncedAt: sql`now()`,
        lastSyncStatus: SyncHealthStatus.OK,
        onboardingBackfillCompletedAt: sql`now()`,
      })
      .returning({ id: schema.locations.id });

    const row = rows[0];
    if (!row) throw new Error('Failed to insert demo location');
    return row;
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

  async setActiveLocation(
    tx: DrizzleTransaction,
    input: { tenantId: string; locationId: string }
  ): Promise<void> {
    await tx
      .update(schema.tenants)
      .set({ activeLocationId: input.locationId, updatedAt: sql`now()` })
      .where(eq(schema.tenants.id, input.tenantId));
  }

  async insertReview(tx: DrizzleTransaction, input: InsertDemoReviewInput): Promise<void> {
    await tx.insert(schema.reviews).values({
      tenantId: input.tenantId,
      locationId: input.locationId,
      externalReviewId: input.externalReviewId,
      externalReviewerId: input.externalReviewerId,
      rating: input.rating,
      reviewText: input.reviewText,
      reviewerName: input.reviewerName,
      reviewedAt: input.reviewedAt,
      externalUpdatedAt: input.reviewedAt,
      sentiment: input.sentiment,
      classification: input.classification,
      escalationReason: input.escalationReason,
      status: input.status,
    });
  }
}
