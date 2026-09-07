import { ResponseSource } from '@common/enums/response-source.enum';
import { ResponseStatus } from '@common/enums/response-status.enum';
import { ResponseType } from '@common/enums/response-type.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, sql } from 'drizzle-orm';

export interface SyncRunRow {
  id: string;
  tenantId: string;
  locationId: string;
  trigger: SyncTrigger;
  startedAt: string;
  completedAt: string | null;
  status: SyncRunStatus;
  reviewsFetched: number | null;
  reviewsTotal: number | null;
  errorMessage: string | null;
  /** Bumped on every progress write — the heartbeat both the reclaim predicate and `isStale` read. */
  updatedAt: string;
}

export interface UpsertReviewInput {
  tenantId: string;
  locationId: string;
  externalReviewId: string;
  externalReviewerId: string | null;
  rating: number;
  reviewText: string | null;
  reviewerName: string | null;
  reviewedAt: string;
  externalUpdatedAt: string;
  status: ReviewStatus;
}

export interface InsertImportedReplyInput {
  tenantId: string;
  reviewId: string;
  content: string;
  postedAt: string;
}

const SYNC_RUN_COLUMNS = {
  id: schema.syncRuns.id,
  tenantId: schema.syncRuns.tenantId,
  locationId: schema.syncRuns.locationId,
  trigger: schema.syncRuns.trigger,
  startedAt: schema.syncRuns.startedAt,
  completedAt: schema.syncRuns.completedAt,
  status: schema.syncRuns.status,
  reviewsFetched: schema.syncRuns.reviewsFetched,
  reviewsTotal: schema.syncRuns.reviewsTotal,
  errorMessage: schema.syncRuns.errorMessage,
  updatedAt: schema.syncRuns.updatedAt,
} as const;

/** How long a `running` row may go without progress before another run may reclaim it. PLAN.md
 * §8.1's tolerance — 2× the 15-minute poll interval. */
const STALE_RUN_MINUTES = 30;

/**
 * The single owner of `sync_runs`, `reviews` and `review_responses`. Nothing in
 * `src/db/repositories/connections/` touches these tables, and nothing here touches
 * `locations` — cross-domain work happens in a DB service passing one `tx` to both repositories.
 */
@Injectable()
export class ReviewSyncRepository {
  constructor(private readonly dbService: DBService) {}

  transaction<T>(fn: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
    return this.dbService.db.transaction(fn);
  }

  /**
   * Reclaims a wedged run, then inserts. **Both halves are required**, and the documented rule is
   * only the first half.
   *
   * PLAN.md §8.1 describes staleness as a *read* predicate ("a running row older than 30 minutes
   * is treated as not blocking"), but the blocking is done by a partial unique index —
   * `UNIQUE (location_id) WHERE status = 'running'` — which rejects a second insert regardless of
   * how old the first row is. So a crashed backfill wedges the location permanently, and since
   * §8.2 gates the entire live pipeline on backfill completing, that tenant then never ingests a
   * single review. The stale row has to actually be moved out of `running`.
   *
   * `GREATEST(started_at, updated_at)`, not `started_at`: the doc's own error message says "no
   * progress for 30 minutes" while its predicate checks *start* time, which would reclaim a
   * legitimately long backfill out from under itself and start a second import over the same
   * history. This works because the job writes `reviews_fetched` (and `updated_at`) after every
   * page, so `updated_at` is a genuine heartbeat.
   */
  async acquireSyncRun(
    tx: DrizzleTransaction,
    input: { tenantId: string; locationId: string; trigger: SyncTrigger }
  ): Promise<SyncRunRow> {
    await tx
      .update(schema.syncRuns)
      .set({
        status: SyncRunStatus.ERROR,
        completedAt: sql`now()`,
        updatedAt: sql`now()`,
        errorMessage: `reclaimed: no progress for ${STALE_RUN_MINUTES} minutes`,
      })
      .where(
        and(
          eq(schema.syncRuns.locationId, input.locationId),
          eq(schema.syncRuns.status, SyncRunStatus.RUNNING),
          sql`GREATEST(${schema.syncRuns.startedAt}, ${schema.syncRuns.updatedAt}) < now() - interval '${sql.raw(String(STALE_RUN_MINUTES))} minutes'`
        )
      );

    // Still allowed to raise 23505 on idx_sync_runs_location_id_running — a genuinely live run is
    // exactly what should block this one. The caller maps that to BACKFILL_ALREADY_RUNNING.
    const rows = await tx
      .insert(schema.syncRuns)
      .values({
        tenantId: input.tenantId,
        locationId: input.locationId,
        trigger: input.trigger,
        startedAt: sql`now()`,
        status: SyncRunStatus.RUNNING,
      })
      .returning(SYNC_RUN_COLUMNS);

    const row = rows[0];
    if (!row) {
      throw new Error('Failed to acquire sync run');
    }
    return row as SyncRunRow;
  }

  /** The heartbeat `acquireSyncRun`'s staleness predicate depends on — written after every page. */
  async recordSyncProgress(
    syncRunId: string,
    input: { reviewsFetched: number; reviewsTotal?: number | undefined }
  ): Promise<void> {
    await this.dbService.db
      .update(schema.syncRuns)
      .set({
        reviewsFetched: input.reviewsFetched,
        ...(input.reviewsTotal !== undefined ? { reviewsTotal: input.reviewsTotal } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(schema.syncRuns.id, syncRunId));
  }

  /**
   * Compare-and-set on `status = 'running'`. Zero rows updated means this run was reclaimed as
   * stale while it was still working, and its result is no longer authoritative — without the CAS
   * a reclaimed run resurrects itself from `error` back to `ok`, and worse, goes on to set
   * `onboarding_backfill_completed_at` for an import a second run is currently redoing.
   *
   * Returns whether this run still owned the row.
   */
  async completeSyncRun(
    syncRunId: string,
    input: {
      status: SyncRunStatus.ERROR | SyncRunStatus.OK;
      reviewsFetched: number;
      errorMessage: string | null;
    }
  ): Promise<boolean> {
    const rows = await this.dbService.db
      .update(schema.syncRuns)
      .set({
        status: input.status,
        completedAt: sql`now()`,
        updatedAt: sql`now()`,
        reviewsFetched: input.reviewsFetched,
        errorMessage: input.errorMessage,
      })
      .where(
        and(eq(schema.syncRuns.id, syncRunId), eq(schema.syncRuns.status, SyncRunStatus.RUNNING))
      )
      .returning({ id: schema.syncRuns.id });

    return rows.length > 0;
  }

  async findLatestRunForLocation(
    locationId: string,
    trigger?: SyncTrigger
  ): Promise<SyncRunRow | null> {
    const conditions = [eq(schema.syncRuns.locationId, locationId)];
    if (trigger) {
      conditions.push(eq(schema.syncRuns.trigger, trigger));
    }

    const rows = await this.dbService.db
      .select(SYNC_RUN_COLUMNS)
      .from(schema.syncRuns)
      .where(and(...conditions))
      .orderBy(desc(schema.syncRuns.startedAt))
      .limit(1);

    return (rows[0] as SyncRunRow | undefined) ?? null;
  }

  async findRunningRunForLocation(locationId: string): Promise<SyncRunRow | null> {
    const rows = await this.dbService.db
      .select(SYNC_RUN_COLUMNS)
      .from(schema.syncRuns)
      .where(
        and(
          eq(schema.syncRuns.locationId, locationId),
          eq(schema.syncRuns.status, SyncRunStatus.RUNNING)
        )
      )
      .limit(1);

    return (rows[0] as SyncRunRow | undefined) ?? null;
  }

  async listRunsForLocation(input: {
    locationId: string;
    page: number;
    pageSize: number;
    status?: SyncRunStatus | undefined;
    trigger?: SyncTrigger | undefined;
  }): Promise<{ runs: SyncRunRow[]; total: number }> {
    const conditions = [eq(schema.syncRuns.locationId, input.locationId)];
    if (input.status) {
      conditions.push(eq(schema.syncRuns.status, input.status));
    }
    if (input.trigger) {
      conditions.push(eq(schema.syncRuns.trigger, input.trigger));
    }
    const where = and(...conditions);

    const [runs, totals] = await Promise.all([
      this.dbService.db
        .select(SYNC_RUN_COLUMNS)
        .from(schema.syncRuns)
        .where(where)
        // The exact ordering idx_sync_runs_location_id_started_at was added for.
        .orderBy(desc(schema.syncRuns.startedAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.dbService.db.select({ value: count() }).from(schema.syncRuns).where(where),
    ]);

    return { runs: runs as SyncRunRow[], total: totals[0]?.value ?? 0 };
  }

  /**
   * Idempotent per `(location_id, external_review_id)`.
   *
   * `classification` and `status` are deliberately **absent** from the `DO UPDATE SET` list. A
   * re-run — a retried backfill, a poller re-reading a page — would otherwise reset a review the
   * team has already triaged back to `pending_classification`/`new`, silently undoing human work
   * and re-queueing an AI draft for a review that was already answered.
   */
  async upsertReview(
    tx: DrizzleTransaction,
    input: UpsertReviewInput
  ): Promise<{ id: string; inserted: boolean }> {
    const rows = await tx
      .insert(schema.reviews)
      .values({
        tenantId: input.tenantId,
        locationId: input.locationId,
        externalReviewId: input.externalReviewId,
        externalReviewerId: input.externalReviewerId,
        rating: input.rating,
        reviewText: input.reviewText,
        reviewerName: input.reviewerName,
        reviewedAt: input.reviewedAt,
        externalUpdatedAt: input.externalUpdatedAt,
        status: input.status,
      })
      .onConflictDoUpdate({
        target: [schema.reviews.locationId, schema.reviews.externalReviewId],
        set: {
          rating: sql`excluded.rating`,
          reviewText: sql`excluded.review_text`,
          reviewerName: sql`excluded.reviewer_name`,
          externalUpdatedAt: sql`excluded.external_updated_at`,
          updatedAt: sql`now()`,
        },
      })
      .returning({
        id: schema.reviews.id,
        // `xmax = 0` is Postgres's way of saying "this tuple was inserted, not updated" — the
        // only way to tell an insert from an update through ON CONFLICT, and what lets the job
        // count genuinely new reviews rather than rows touched.
        inserted: sql<boolean>`(xmax = 0)`,
      });

    const row = rows[0];
    if (!row) {
      throw new Error('Failed to upsert review');
    }
    return row;
  }

  /**
   * The owner's own historical reply, imported as `source = 'imported'`.
   *
   * `ON CONFLICT (review_id) WHERE source = 'imported'` — the `WHERE` clause is **required**:
   * without it Postgres cannot infer the partial index as the conflict arbiter and the statement
   * errors outright rather than falling back to the table.
   *
   * `response_type = 'imported_reply'` is the enum value this feature added. The column is
   * NOT NULL and the two pre-existing values (`auto_reply_suggestion`, `escalation_snippet`)
   * both describe AI output, so before that enum change this insert had no legal value at all.
   *
   * Returns false when the row already existed, so the caller can count imports honestly.
   */
  async insertImportedReply(
    tx: DrizzleTransaction,
    input: InsertImportedReplyInput
  ): Promise<boolean> {
    const rows = await tx
      .insert(schema.reviewResponses)
      .values({
        tenantId: input.tenantId,
        reviewId: input.reviewId,
        responseType: ResponseType.IMPORTED_REPLY,
        content: input.content,
        source: ResponseSource.IMPORTED,
        status: ResponseStatus.POSTED,
        postedAt: input.postedAt,
      })
      // `where` here is the *index predicate*, not a row filter — it is what tells Postgres which
      // of the two partial unique indexes on review_id to use as the arbiter.
      .onConflictDoNothing({
        target: schema.reviewResponses.reviewId,
        where: sql`source = 'imported'`,
      })
      .returning({ id: schema.reviewResponses.id });

    return rows.length > 0;
  }

  async countReviewsForLocation(locationId: string): Promise<number> {
    const rows = await this.dbService.db
      .select({ value: count() })
      .from(schema.reviews)
      .where(eq(schema.reviews.locationId, locationId));

    return rows[0]?.value ?? 0;
  }
}
