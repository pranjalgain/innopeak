import { EscalationReason } from '@common/enums/escalation-reason.enum';
import { ResponseSource } from '@common/enums/response-source.enum';
import { ResponseStatus } from '@common/enums/response-status.enum';
import { ResponseType } from '@common/enums/response-type.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
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

export interface PendingClassificationRow {
  id: string;
  rating: number;
  reviewText: string | null;
}

export interface ClaimClassificationInput {
  classification: ReviewClassification.AUTO_REPLY_CANDIDATE | ReviewClassification.ESCALATED;
  escalationReason: EscalationReason | null;
  matchedKeywords: string[] | null;
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
    // exactly what should block this one. The caller (`ConnectionsDbService.confirmLocation`)
    // catches it and reports `backfillAlreadyRunning: true` in a 200/201 body, not a 409 — see
    // `ConnectionsService.confirmLocation`.
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
   * `reviewsFetched` is optional and, when omitted, is left out of the `SET` clause entirely
   * rather than written as some caller-supplied number. `recordSyncProgress` already writes the
   * true cumulative count after every page **during** the run — it is the only place that counter
   * is incremented — so a caller completing the run only has an authoritative number of its own
   * on a clean success. On a failure that happened mid-import, the caller's own local counter was
   * never updated past its starting value (the count only lives inside the paginating loop, and a
   * throw from partway through it never returns anything to the caller), so passing it here would
   * silently overwrite real progress with a stale, usually-zero number — turning "700 reviews
   * imported, then a 401 on page 15" into a run that reports 0. Leaving the column untouched keeps
   * whatever the last successful page's `recordSyncProgress` call wrote, which is the accurate
   * figure either way.
   *
   * `finalizeReviewsTotal` closes a different gap: `reviews_total` is written mid-run from the
   * provider's own `totalCount` (the location's *lifetime* review count), while backfill
   * deliberately stops early once it hits `IMPORTED_REPLY_TARGET` or `MAX_PAGES` (see
   * `review-sync-queue.service.ts`). A location with 400 lifetime reviews whose sampled 60 satisfy
   * the reply target completes successfully having imported everything backfill ever intended to
   * — but `reviews_total` is still 400, so `reviews_fetched / reviews_total` reports 15% forever
   * for a run that is, by design, entirely done. Only set on a clean, complete success: it
   * overwrites the misleading provider-lifetime figure with the run's own final count, so the
   * percentage this specific run reports can actually reach 100.
   *
   * Returns whether this run still owned the row.
   */
  async completeSyncRun(
    syncRunId: string,
    input: {
      status: SyncRunStatus.ERROR | SyncRunStatus.OK;
      reviewsFetched?: number;
      errorMessage: string | null;
      finalizeReviewsTotal?: boolean;
    }
  ): Promise<boolean> {
    const rows = await this.dbService.db
      .update(schema.syncRuns)
      .set({
        status: input.status,
        completedAt: sql`now()`,
        updatedAt: sql`now()`,
        ...(input.reviewsFetched !== undefined ? { reviewsFetched: input.reviewsFetched } : {}),
        ...(input.finalizeReviewsTotal && input.reviewsFetched !== undefined
          ? { reviewsTotal: input.reviewsFetched }
          : {}),
        errorMessage: input.errorMessage,
      })
      .where(
        and(eq(schema.syncRuns.id, syncRunId), eq(schema.syncRuns.status, SyncRunStatus.RUNNING))
      )
      .returning({ id: schema.syncRuns.id });

    return rows.length > 0;
  }

  /**
   * Reclaims a backfill run this same job already owns, for a BullMQ retry. Compare-and-set on
   * `status = 'error'`, mirroring `completeSyncRun`'s CAS the other direction.
   *
   * `runBackfill` carries its `sync_runs` row's id across attempts (`IReviewBackfillJob.syncRunId`
   * — acquired once, before the job is ever published), so a second attempt after the first threw
   * is not a new run; it is the same one, replaying. But `completeSyncRun` already moved that row
   * to `error` when attempt one's catch block recorded the failure — and its own CAS only matches
   * `status = 'running'`. Left as-is, a *successful* second attempt's own `completeSyncRun` call
   * finds zero rows to update (status is `error`, not `running`), so `markBackfillCompleted` and
   * `advanceLastReviewSyncedAt` silently never run: `onboarding_backfill_completed_at` stays null,
   * the location is excluded from polling forever, and BullMQ still marks the job completed — a
   * fully successful import that the rest of the system can never see. This reopens the row first,
   * so the second attempt's completion has a `running` row to CAS against, same as the first.
   *
   * `error_message`/`completed_at` are cleared, not left stale, since the row is no longer
   * terminal; `started_at` is left untouched — it is the run's real start, not this attempt's.
   */
  async reopenSyncRunForRetry(syncRunId: string): Promise<boolean> {
    const rows = await this.dbService.db
      .update(schema.syncRuns)
      .set({
        status: SyncRunStatus.RUNNING,
        completedAt: null,
        errorMessage: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(schema.syncRuns.id, syncRunId), eq(schema.syncRuns.status, SyncRunStatus.ERROR))
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

  /**
   * The classification queue read: `classification = 'pending_classification'` (the DB default,
   * never touched by `upsertReview`'s `DO UPDATE SET`) **and** `status = 'new'`.
   *
   * Both halves are required. `status = 'new'` is what PLAN.md §7 means by "backfilled reviews
   * skip the live workflow entirely" — `resolveBackfillStatus` deliberately sorts imported history
   * into `responded` (already answered) and `dismissed` (old, unanswered) precisely so those rows
   * are never routed, drafted for, or escalated about, and §7's implementation note is explicit
   * that only a `new` row is "eligible for §8.3's claim-and-classify step, no special case
   * anywhere else in the pipeline." Filtering on `classification` alone would classify a decade of
   * already-answered reviews and escalate every low-rated one among them — the exact flood §7
   * exists to prevent.
   *
   * Ordered oldest-review-first so that hitting `limit` truncates predictably rather than
   * arbitrarily; `reviewed_at` is nullable, and Postgres sorts those NULLs last on ASC.
   */
  async findPendingClassification(
    tenantId: string,
    locationId: string,
    limit: number
  ): Promise<PendingClassificationRow[]> {
    const rows = await this.dbService.db
      .select({
        id: schema.reviews.id,
        rating: schema.reviews.rating,
        reviewText: schema.reviews.reviewText,
      })
      .from(schema.reviews)
      .where(
        and(
          eq(schema.reviews.tenantId, tenantId),
          eq(schema.reviews.locationId, locationId),
          eq(schema.reviews.classification, ReviewClassification.PENDING_CLASSIFICATION),
          eq(schema.reviews.status, ReviewStatus.NEW)
        )
      )
      .orderBy(schema.reviews.reviewedAt)
      .limit(limit);

    return rows;
  }

  /**
   * Compare-and-set on the same two columns `findPendingClassification` selects on, the same CAS
   * shape as `completeSyncRun`. Zero rows updated means the review is no longer a candidate:
   * another worker classified it first (a retried backfill, an overlapping run), or a human moved
   * it off `new` in the window between the queue read and this write. Both are "nothing to do,"
   * not an error.
   *
   * **What this does and does not guarantee.** It closes PLAN.md §8.3's double-*classification*
   * race: no review is ever classified twice. It does **not** guarantee the decision was made
   * against current data, because the predicate omits `rating` and `review_text` — the columns
   * `classifyReview` actually read, and the ones `upsertReview` overwrites on conflict. A run
   * reclaimed as stale (§8.1) can therefore re-import an edited review while the reclaimed run is
   * still mid-batch, and that run's write lands with the CAS satisfied and a stale rating behind
   * it. Narrow, and §8.6's supersede-and-reclassify is the general owner of "content changed after
   * classification" — but it is not closed here.
   *
   * `status` is re-checked but never *written*: §8.3's `status = 'new' → 'in_review'` transition
   * belongs to the generation step, which doesn't exist in this codebase yet. Writing it here
   * would mark a review as having a pending draft when nothing has drafted anything.
   */
  async claimClassification(reviewId: string, input: ClaimClassificationInput): Promise<boolean> {
    const rows = await this.dbService.db
      .update(schema.reviews)
      .set({
        classification: input.classification,
        escalationReason: input.escalationReason,
        matchedKeywords: input.matchedKeywords,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.reviews.id, reviewId),
          eq(schema.reviews.classification, ReviewClassification.PENDING_CLASSIFICATION),
          eq(schema.reviews.status, ReviewStatus.NEW)
        )
      )
      .returning({ id: schema.reviews.id });

    return rows.length > 0;
  }

  /**
   * `PLAN.md` §6's nightly reviewer-retention purge. Only tenants with an explicit
   * `tenant_settings.review_data_retention_months` are touched — there is deliberately no
   * platform-default fallback, so a tenant who has never set this stays fully untouched rather
   * than being purged against a number nobody chose for them.
   *
   * `rating` / `review_text` / `classification` are never touched: the business legitimately
   * needs "we got a 2★ review in March" long after retention expires — what must go is the link
   * to a named individual, not the review's own content. `external_reviewer_id` is nulled
   * alongside `reviewer_name` so nothing pseudonymously re-identifies the same reviewer across
   * visits after anonymization (confirmed as the intended behavior, not left to guess).
   *
   * `COALESCE(reviewed_at, created_at)` is load-bearing, not defensive: `reviewed_at` is nullable,
   * and any comparison against `NULL` is unknown rather than true in SQL, so a review ingested
   * without a parseable timestamp would otherwise sit permanently un-purgeable — the opposite of
   * what this job exists to guarantee.
   *
   * `anonymized_at IS NULL` makes this idempotent: an already-anonymized row is not re-selected on
   * a later run (harmless either way, since the columns are already null and the UPDATE would be
   * an inert no-op, but skipping it keeps `anonymized_at` as the true first-anonymized timestamp
   * rather than the most recent purge run that happened to touch it).
   *
   * Wrapped in a transaction-scoped advisory lock: `@Cron` fires in-process on *every* worker
   * replica (see the scheduling doc's "one honest caveat"), so more than one replica can enqueue
   * this job for the same nightly tick. The UPDATE above is idempotent on its own, but without a
   * lock two concurrent executions would both scan and both attempt to update the same rows,
   * wasteful and racy for no benefit. The lock makes the second execution simply wait, then find
   * nothing left to match — not skip its work silently, just make it a fast no-op.
   */
  async purgeExpiredReviewerPii(): Promise<number> {
    return this.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('reviews:retention-purge'), 0)`);

      // `review_data_retention_months` is deliberately unbounded at the API layer (a tenant may
      // set an astronomically large value to mean "keep indefinitely" — see
      // UpdateTenantSettingsDto). But `now() - (N || ' months')::interval` overflows Postgres's
      // representable timestamp range well before Postgres's own INTEGER range does (confirmed:
      // 80,000 months computes fine, 100,000 raises `timestamp out of range`) — and that overflow
      // aborts this entire cross-tenant UPDATE, so one tenant's huge-but-valid setting would stop
      // every other tenant's purge from running, silently, every night. LEAST(...) clamps only the
      // value fed into the interval arithmetic, never the stored column: 10,000 months (~833
      // years) is already so far past any real review's age that clamping to it changes no real
      // purge decision, while keeping the arithmetic permanently inside Postgres's range.
      const result = await tx.execute(sql`
        UPDATE reviews r
        SET reviewer_name = NULL,
            external_reviewer_id = NULL,
            anonymized_at = now(),
            updated_at = now()
        FROM tenant_settings ts
        WHERE r.tenant_id = ts.tenant_id
          AND ts.review_data_retention_months IS NOT NULL
          AND r.anonymized_at IS NULL
          AND COALESCE(r.reviewed_at, r.created_at)
            < now() - (LEAST(ts.review_data_retention_months, 10000) || ' months')::interval
        RETURNING r.id
      `);

      const reviewIds = result.rows.map(row => (row as { id: string }).id);

      // The gap `0000_foundation.sql`'s own GDPR note documents: log_db_changes() snapshots a full
      // row on every write, so the UPDATE above is itself captured verbatim in audit_logs before
      // the anonymization — the reviewer_name/external_reviewer_id this purge just cleared from
      // `reviews` survives in every prior snapshot of that row too (every intermediate UPDATE
      // before this one also captured the name, not just the latest). Without also redacting here,
      // the purge deletes the tenant-facing copy while leaving an unpurged, indefinitely-retained
      // copy sitting in the audit trail — the exact PII this job exists to remove from long-term
      // storage. `idx_audit_logs_table_name`/`idx_audit_logs_old_value_gin`/`_new_value_gin`
      // (see 0000_foundation.sql) make this a targeted scan rather than a full-table one.
      if (reviewIds.length > 0) {
        // A Postgres array-literal string (`{id1,id2,...}`), not a JS array: drizzle-orm's `sql`
        // template expands an interpolated array into one bound parameter per element
        // (`ANY(($0, $1, ...))`), which is not valid syntax to cast to `uuid[]` — a single literal
        // string cast via `::uuid[]` is what actually binds as one array-typed parameter.
        const reviewIdsArrayLiteral = `{${reviewIds.join(',')}}`;

        await tx.execute(sql`
          UPDATE audit_logs
          SET old_value = old_value - 'reviewer_name' - 'external_reviewer_id',
              new_value = new_value - 'reviewer_name' - 'external_reviewer_id'
          WHERE table_name = 'reviews'
            AND (
              (old_value->>'id')::uuid = ANY(${reviewIdsArrayLiteral}::uuid[])
              OR (new_value->>'id')::uuid = ANY(${reviewIdsArrayLiteral}::uuid[])
            )
        `);
      }

      return result.rows.length;
    });
  }
}
