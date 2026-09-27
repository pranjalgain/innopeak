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
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';

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

/** What `findClassifiedNeedingGeneration` reads — everything `AiReplyGenerationService` needs to
 *  draft a reply, and nothing else. `classification` is narrowed the same way
 *  `ClaimClassificationInput`'s is: this row only ever exists because `claimClassification`
 *  already wrote one of these two values, `pending_classification` is not a real possibility. */
export interface GenerationCandidateRow {
  id: string;
  rating: number;
  reviewText: string | null;
  reviewerName: string | null;
  classification: ReviewClassification.AUTO_REPLY_CANDIDATE | ReviewClassification.ESCALATED;
}

export interface InsertGeneratedResponseInput {
  tenantId: string;
  reviewId: string;
  responseType: ResponseType.AUTO_REPLY_SUGGESTION | ResponseType.ESCALATION_SNIPPET;
  content: string;
  /** Non-null only for `ESCALATION_SNIPPET` rows — see that constant's own doc comment in
   *  `ai-reply-generation.service.ts` for why an escalated review still gets a group id even
   *  while only one snippet is generated per review today. */
  generationGroupId: string | null;
  generationMetadata: Record<string, unknown>;
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
 * How long a review may sit `in_review` with no draft behind it before `reclaimStaleGenerationClaims`
 * hands it back to the generation queue. Same 30 minutes, and the same reasoning, as
 * `STALE_RUN_MINUTES` above: generation takes seconds, so anything still claimed after half an hour
 * is not slow, it is abandoned — the worker died between `claimForGeneration` and
 * `insertGeneratedResponse` (a deploy, an OOM kill, a stalled BullMQ job). Without this sweep those
 * reviews are stranded permanently: `findClassifiedNeedingGeneration` only ever reads
 * `status = 'new'`, and nothing else in this codebase moves a row off `in_review`.
 */
const STALE_GENERATION_CLAIM_MINUTES = 30;

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

  /**
   * `tx` matters when the caller is already inside a transaction holding a lock this read could
   * queue behind — `confirmLocations` reads through its own `tx` after a sync-run constraint
   * violation rather than borrowing a second pooled connection while holding the tenant's
   * advisory lock.
   */
  async findRunningRunForLocation(
    locationId: string,
    tx?: DrizzleTransaction
  ): Promise<SyncRunRow | null> {
    const rows = await (tx ?? this.dbService.db)
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
   * The generation queue read — reviews `claimClassification` already routed to one of the two
   * live-pipeline outcomes, still sitting at `status = 'new'` because nothing has drafted a reply
   * for them yet. Deliberately query-driven rather than fed a list from the classification step
   * that just ran: this also picks up any backlog left behind by a prior tick whose generation
   * step failed partway (the exact case `releaseGenerationClaim` below exists for), with no extra
   * bookkeeping needed to notice it.
   *
   * **Newest first — deliberately the opposite of `findPendingClassification`'s oldest-first**, and
   * the divergence is the point, not an inconsistency to tidy up. Classification is bounded only
   * by a generous per-tick batch size, so its leftovers are drafted on the very next tick and the
   * order barely matters. Generation is bounded by a *monthly* quota (`max_ai_drafts_per_month`),
   * and anything it doesn't reach may not get another chance for weeks. Oldest-first against that
   * cap inverts the priority: a Free tenant onboarding a location with 30 recent unanswered
   * reviews would spend its entire month's allowance on the oldest 20 within a minute of
   * connecting, leaving every genuinely new review that month undrafted. A reply to a review from
   * three days ago is worth more than one from fifty-eight days ago, and under a hard cap the
   * freshest reviews must not also be last in line.
   *
   * `NULLS LAST` is load-bearing on `DESC`, not decoration: Postgres defaults to `NULLS FIRST`
   * when sorting descending, and `reviewed_at` is nullable (PLAN.md §6 calls out reviews ingested
   * without a parseable provider timestamp). Without it, exactly those undated reviews would sort
   * ahead of everything and consume the quota first — the precise failure this ordering exists to
   * prevent, reintroduced through the back door.
   */
  async findClassifiedNeedingGeneration(
    tenantId: string,
    locationId: string,
    limit: number
  ): Promise<GenerationCandidateRow[]> {
    const rows = await this.dbService.db
      .select({
        id: schema.reviews.id,
        rating: schema.reviews.rating,
        reviewText: schema.reviews.reviewText,
        reviewerName: schema.reviews.reviewerName,
        classification: schema.reviews.classification,
      })
      .from(schema.reviews)
      .where(
        and(
          eq(schema.reviews.tenantId, tenantId),
          eq(schema.reviews.locationId, locationId),
          inArray(schema.reviews.classification, [
            ReviewClassification.AUTO_REPLY_CANDIDATE,
            ReviewClassification.ESCALATED,
          ]),
          eq(schema.reviews.status, ReviewStatus.NEW),
          // Belt to `claimForGeneration`'s braces, and *not* redundant with it. The CAS only stops
          // two workers drafting the same review at the same time; it says nothing about a review
          // that already has a draft and has since been handed back to `new` — which happens
          // whenever `insertGeneratedResponse` commits and then the connection drops before its
          // RETURNING row is read, or a stale claim is reclaimed a moment too eagerly. Without
          // this, that review is drafted a second time: nothing in the schema forbids two
          // `ai_generated` rows for one review (the partial uniques on `review_responses` cover
          // only `status IN ('approved','posted')` and `source = 'imported'`), and both would
          // count against the tenant's monthly draft quota.
          //
          // The outer correlation is the literal `reviews.id`, never `${schema.reviews.id}`:
          // interpolating a Column inside a `sql` template renders its BARE name, which would bind
          // to `review_responses.id` here and make the predicate compare a row to itself. Same
          // trap, same fix, as `AdminBusinessesRepository`'s own correlated subqueries.
          sql`NOT EXISTS (
            SELECT 1 FROM ${schema.reviewResponses}
            WHERE ${schema.reviewResponses.reviewId} = reviews.id
              AND ${schema.reviewResponses.source} = ${ResponseSource.AI_GENERATED}
          )`
        )
      )
      .orderBy(sql`${schema.reviews.reviewedAt} DESC NULLS LAST`)
      .limit(limit);

    // The `inArray` above is a type-level fact to Postgres, not to Drizzle's inferred return type
    // (which is the column's full enum, `pending_classification` included) — safe to narrow here
    // because the query itself makes that value unreachable, the same reasoning
    // `ClaimClassificationInput`'s own narrower type already relies on.
    return rows as GenerationCandidateRow[];
  }

  /**
   * PLAN.md §8.3's other half: `claimClassification` closes the double-*classification* race,
   * this one closes double-*generation* — the same CAS shape, on the same `status` column,
   * against the state classification actually left the review in. Zero rows updated means another
   * worker already claimed it (or generated for it and posted, moving it further along) between
   * the queue read and this write; both are "nothing to do here," not an error.
   */
  async claimForGeneration(reviewId: string): Promise<boolean> {
    const rows = await this.dbService.db
      .update(schema.reviews)
      .set({ status: ReviewStatus.IN_REVIEW, updatedAt: sql`now()` })
      .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.status, ReviewStatus.NEW)))
      .returning({ id: schema.reviews.id });

    return rows.length > 0;
  }

  /**
   * Undoes `claimForGeneration` when the AI call itself fails after the claim — without this, a
   * review whose generation attempt failed would sit at `status = 'in_review'` forever with no
   * draft behind it, invisible to every later poll's own `findClassifiedNeedingGeneration` query
   * (which only ever reads `status = 'new'`). Reverting back to `new` is what lets the *next*
   * 15-minute tick retry it, the same self-healing shape `findClassifiedNeedingGeneration`'s own
   * doc comment describes for a mid-batch failure.
   *
   * CAS'd against `in_review`, not unconditional, so this can never undo a *different* transition
   * that happened in between (a human posting a manual reply, say, which moves status further
   * along, not back to `new`) — this only ever reverses the exact claim it is paired with.
   */
  async releaseGenerationClaim(reviewId: string): Promise<void> {
    await this.dbService.db
      .update(schema.reviews)
      .set({ status: ReviewStatus.NEW, updatedAt: sql`now()` })
      .where(
        and(eq(schema.reviews.id, reviewId), eq(schema.reviews.status, ReviewStatus.IN_REVIEW))
      );
  }

  /**
   * The sweep `releaseGenerationClaim` cannot be: that one only runs from a `catch` inside a live
   * process, so it covers a *caught exception* and nothing else. A worker that dies outright
   * between `claimForGeneration` and `insertGeneratedResponse` — a deploy, an OOM kill, a stalled
   * BullMQ job — leaves its in-flight review at `in_review` with no draft, where
   * `findClassifiedNeedingGeneration` (which reads only `status = 'new'`) can never see it again.
   * Nothing else in this codebase moves a row off `in_review`, so without this sweep that review
   * is stranded permanently: never drafted, never retried, yet still counted in the dashboard's
   * open backlog (`DashboardDbService.OPEN_STATUSES` spans `new` *and* `in_review`).
   *
   * Same reclaim-then-proceed shape as `acquireSyncRun`'s own stale-run handling above, and called
   * the same way — immediately before the queue read it unblocks.
   *
   * **The `NOT EXISTS` guard is the load-bearing half, not a safety flourish.** A review that was
   * drafted *successfully* also sits at `in_review` indefinitely, because the approval flow that
   * would move it to `responded` does not exist yet. Reclaiming on age alone would therefore walk
   * every successfully-drafted review in the tenant back to `new` half an hour later and draft it
   * again — every tick, forever, each one a billable call. Only a claim with nothing behind it is
   * genuinely abandoned. Deliberately checks for *any* response row rather than an `ai_generated`
   * one: a review that has a human or imported reply is equally not waiting on generation.
   */
  async reclaimStaleGenerationClaims(locationId: string): Promise<number> {
    const rows = await this.dbService.db
      .update(schema.reviews)
      .set({ status: ReviewStatus.NEW, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.reviews.locationId, locationId),
          eq(schema.reviews.status, ReviewStatus.IN_REVIEW),
          sql`${schema.reviews.updatedAt} < now() - interval '${sql.raw(String(STALE_GENERATION_CLAIM_MINUTES))} minutes'`,
          // Literal `reviews.id`, not `${schema.reviews.id}` — same bare-column-name trap
          // documented on `findClassifiedNeedingGeneration`'s own subquery above.
          sql`NOT EXISTS (
            SELECT 1 FROM ${schema.reviewResponses}
            WHERE ${schema.reviewResponses.reviewId} = reviews.id
          )`
        )
      )
      .returning({ id: schema.reviews.id });

    return rows.length;
  }

  /**
   * Persists one AI-generated draft. No `onConflictDoNothing` the way `insertImportedReply` has
   * one: that guards a partial unique index on `review_id` scoped to `source = 'imported'`, which
   * exists specifically to make the historical backfill re-runnable, and there is no equivalent
   * index for `source = 'ai_generated'` to arbitrate against.
   *
   * What keeps a review from being drafted twice is therefore *two* things, not one — worth
   * stating precisely, because "the CAS handles it" is only half true. `claimForGeneration`'s CAS
   * stops two workers drafting the same review **concurrently**; it offers nothing once a claim
   * has been released back to `new` (a failed insert, a reclaimed stale claim), and a plain
   * `INSERT` here would happily add a second row. The other half is
   * `findClassifiedNeedingGeneration`'s `NOT EXISTS` predicate, which keeps an
   * already-drafted review out of the candidate set in the first place.
   */
  async insertGeneratedResponse(input: InsertGeneratedResponseInput): Promise<string> {
    const rows = await this.dbService.db
      .insert(schema.reviewResponses)
      .values({
        tenantId: input.tenantId,
        reviewId: input.reviewId,
        responseType: input.responseType,
        content: input.content,
        source: ResponseSource.AI_GENERATED,
        status: ResponseStatus.PENDING_APPROVAL,
        generationGroupId: input.generationGroupId,
        generationMetadata: input.generationMetadata,
      })
      .returning({ id: schema.reviewResponses.id });

    const inserted = rows[0];
    if (inserted === undefined) {
      // `.insert().returning()` on a successful statement always returns the inserted row —
      // reaching here would mean the insert silently affected zero rows, which Postgres does not
      // do for a plain (non-conflict-guarded) INSERT. Kept as a loud failure rather than a
      // swallowed one specifically because the caller (`AiReplyGenerationService`) needs to know
      // whether to release the generation claim it just took.
      throw new Error(`insertGeneratedResponse affected no rows for review ${input.reviewId}`);
    }
    return inserted.id;
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

      // `audit_logs` (and the second redaction pass this job used to run against it) is gone —
      // that table snapshotted a full row on every write with nothing purging it, which meant the
      // reviewer_name this purge nulls above still lingered forever in every prior snapshot of the
      // row. With no snapshot table left to leak into, the anonymizing UPDATE above is the whole job.
      return result.rows.length;
    });
  }
}
