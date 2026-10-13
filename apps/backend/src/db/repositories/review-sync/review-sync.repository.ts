import { MESSAGES } from '@common/constants/messages.constants';
import { POST_CLAIM_STALE_MINUTES } from '@common/constants/review-post.constants';
import { ResponseSource } from '@common/enums/response-source.enum';
import { ResponseStatus } from '@common/enums/response-status.enum';
import { ResponseType } from '@common/enums/response-type.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { toStoredMessage } from '@common/i18n/message-registry';
import { DBService, DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';

import type {
  ApproveResponseInput,
  ClaimClassificationInput,
  ClaimResponseForPostingInput,
  GenerationCandidateRow,
  InsertGeneratedResponseInput,
  InsertImportedReplyInput,
  InsertManualReplyInput,
  MarkResponsePostedInput,
  MarkResponsePostFailedInput,
  PendingClassificationRow,
  RejectResponseInput,
  RetryPostableResponseInput,
  ReviewResponseRow,
  SupersedeForExternalReplyInput,
  SyncRunRow,
  UpsertReviewInput,
} from './types/review-sync.type';

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

/** How long a `running` row may go without progress before another run may reclaim it (2x the poll interval). */
const STALE_RUN_MINUTES = 30;

/**
 * How long a review may sit `in_review` with no draft before it is handed back to generation.
 * Generation takes seconds, so older means the worker died (deploy, OOM, stalled job), and nothing
 * else moves a row off `in_review`.
 */
const STALE_GENERATION_CLAIM_MINUTES = 30;

/** Sole owner of `sync_runs`, `reviews` and `review_responses`; cross-domain work passes one `tx` to both repositories. */
@Injectable()
export class ReviewSyncRepository {
  constructor(private readonly dbService: DBService) {}

  transaction<T>(fn: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
    return this.dbService.db.transaction(fn);
  }

  /**
   * Reclaims a stale run before inserting: the partial unique index `UNIQUE (location_id) WHERE
   * status = 'running'` blocks a second insert however old the first row is, so a crashed run would
   * wedge the location (and its whole pipeline) permanently. Staleness uses `GREATEST(started_at,
   * updated_at)` since `updated_at` is the per-page heartbeat; `started_at` alone would reclaim a
   * long, healthy backfill.
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

    // May still raise 23505 on idx_sync_runs_location_id_running: a live run should block this
    // one; the caller reports it as `backfillAlreadyRunning`, not a 409.
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
      throw new Error(MESSAGES.REVIEWS.FAILED_TO_ACQUIRE_SYNC_RUN);
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
   * Notes why a running run is not progressing (a rate-limit wait) and counts as a heartbeat, so the run is not mistaken
   * for a hung one. The note is replaced when the run ends: `completeSyncRun` writes the final `error_message` (null on
   * success). Only touches a run that is still `running`.
   */
  async noteSyncRunWaiting(syncRunId: string, message: string): Promise<void> {
    await this.dbService.db
      .update(schema.syncRuns)
      .set({ errorMessage: toStoredMessage(message), updatedAt: sql`now()` })
      .where(
        and(eq(schema.syncRuns.id, syncRunId), eq(schema.syncRuns.status, SyncRunStatus.RUNNING))
      );
  }

  /**
   * CAS on `status = 'running'`: zero rows means the run was reclaimed as stale, so its result is
   * no longer authoritative (it would otherwise resurrect itself to `ok` and set
   * `onboarding_backfill_completed_at` while a second run redoes the import).
   *
   * `reviewsFetched` is left out of the SET when absent: after a mid-import failure the caller's
   * local counter is stale (usually 0) and would overwrite the true count `recordSyncProgress` wrote.
   *
   * `finalizeReviewsTotal` replaces `reviews_total` (the provider's lifetime count) with this run's
   * final count, since backfill stops early by design and the percentage would never reach 100.
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
        errorMessage: toStoredMessage(input.errorMessage),
      })
      .where(
        and(eq(schema.syncRuns.id, syncRunId), eq(schema.syncRuns.status, SyncRunStatus.RUNNING))
      )
      .returning({ id: schema.syncRuns.id });

    return rows.length > 0;
  }

  /**
   * Reopens an `error` run for a BullMQ retry (CAS on `status = 'error'`). The retry reuses the same
   * `sync_runs` row, which the first attempt's failure moved to `error`; without reopening, the
   * retry's `completeSyncRun` CAS matches nothing and `markBackfillCompleted` silently never runs,
   * excluding the location from polling forever. `started_at` is kept: it is the run's real start.
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

  /** Pass `tx` when already inside a transaction holding a lock this read could queue behind, rather than borrowing a second pooled connection. */
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
        .orderBy(desc(schema.syncRuns.startedAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      this.dbService.db.select({ value: count() }).from(schema.syncRuns).where(where),
    ]);

    return { runs: runs as SyncRunRow[], total: totals[0]?.value ?? 0 };
  }

  /**
   * Idempotent per `(location_id, external_review_id)`. `classification` and `status` are
   * deliberately absent from `DO UPDATE SET`, so a re-run never resets an already-triaged review.
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
          // Google listing the review again proves it exists, so an earlier "removed on Google" (inferred from a
          // 404) is withdrawn: back to `in_review` when drafts exist, else `new` for generation to pick up.
          removedUpstreamAt: null,
          status: sql`CASE WHEN reviews.status = ${ReviewStatus.REMOVED}
            THEN (CASE WHEN EXISTS (
              SELECT 1 FROM ${schema.reviewResponses} WHERE ${schema.reviewResponses.reviewId} = reviews.id
            ) THEN ${ReviewStatus.IN_REVIEW} ELSE ${ReviewStatus.NEW} END)::review_status
            ELSE reviews.status END`,
          updatedAt: sql`now()`,
        },
      })
      .returning({
        id: schema.reviews.id,
        // `xmax = 0` means the tuple was inserted, not updated; the only way to tell through ON CONFLICT.
        inserted: sql<boolean>`(xmax = 0)`,
      });

    const row = rows[0];
    if (!row) {
      throw new Error(MESSAGES.REVIEWS.FAILED_TO_UPSERT_REVIEW);
    }
    return row;
  }

  /**
   * The `WHERE` on `ON CONFLICT (review_id)` is required: without it Postgres cannot infer the
   * partial index as arbiter. Returns false when the row already existed.
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
      // `where` is the index predicate (it picks which partial unique index arbitrates), not a row filter.
      .onConflictDoNothing({
        target: schema.reviewResponses.reviewId,
        where: sql`source = 'imported'`,
      })
      .returning({ id: schema.reviewResponses.id });

    return rows.length > 0;
  }

  /**
   * Both predicates are required: `status = 'new'` keeps backfilled history (`responded`/
   * `dismissed`) out of the live workflow, and classifying on `classification` alone would classify
   * and escalate a decade of answered reviews. Oldest first so hitting `limit` truncates predictably.
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
   * CAS on the columns `findPendingClassification` selects on; zero rows means another worker or a
   * human got there first, which is not an error. Prevents double classification but not a stale
   * decision: the predicate omits `rating`/`review_text`, so a run reclaimed as stale can still land
   * a classification against an edited review (narrow; not closed here). `status` is checked but
   * never written: `new -> in_review` belongs to generation.
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
   * Query-driven rather than fed from the classification step, so it also picks up backlog from a
   * tick whose generation failed partway.
   *
   * Newest first, deliberately the opposite of `findPendingClassification`: generation is bounded
   * by a monthly quota, and oldest-first would let a tenant onboarding 30 unanswered reviews burn
   * the month's allowance on the oldest. `NULLS LAST` is required because Postgres sorts NULLs
   * first on DESC, which would put undated reviews at the front.
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
          // Not redundant with `claimForGeneration`'s CAS, which only stops concurrent drafting: a
          // review already drafted and handed back to `new` (insert committed but the connection
          // dropped, or an eager stale reclaim) would be drafted twice, since nothing in the schema
          // forbids two `ai_generated` rows, and both would count against the monthly quota.
          //
          // Correlate on the literal `reviews.id`: interpolating a Column in a `sql` template
          // renders its bare name, which would bind to `review_responses.id` here.
          sql`NOT EXISTS (
            SELECT 1 FROM ${schema.reviewResponses}
            WHERE ${schema.reviewResponses.reviewId} = reviews.id
              AND ${schema.reviewResponses.source} = ${ResponseSource.AI_GENERATED}
          )`
        )
      )
      .orderBy(sql`${schema.reviews.reviewedAt} DESC NULLS LAST`)
      .limit(limit);

    // `inArray` narrows at the SQL level but not in Drizzle's inferred type; the cast is safe
    // because the query excludes `pending_classification`.
    return rows as GenerationCandidateRow[];
  }

  /** CAS on `status = 'new'`, closing double-generation as `claimClassification` closes double-classification. Zero rows means another worker got there first; not an error. */
  async claimForGeneration(reviewId: string): Promise<boolean> {
    const rows = await this.dbService.db
      .update(schema.reviews)
      .set({ status: ReviewStatus.IN_REVIEW, updatedAt: sql`now()` })
      .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.status, ReviewStatus.NEW)))
      .returning({ id: schema.reviews.id });

    return rows.length > 0;
  }

  /**
   * Undoes `claimForGeneration` after an AI failure so the next tick can retry; otherwise the review
   * sits `in_review` forever, invisible to `findClassifiedNeedingGeneration`. CAS'd on `in_review`
   * so it never undoes a different transition (e.g. a human's manual reply).
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
   * Sweep for workers that died between `claimForGeneration` and `insertGeneratedResponse` (deploy,
   * OOM, stalled job), which `releaseGenerationClaim`'s catch cannot cover; otherwise the review
   * stays `in_review` forever, undrafted yet counted in the dashboard's open backlog. Call it
   * immediately before the queue read it unblocks.
   *
   * The `NOT EXISTS` guard is load-bearing: a successfully drafted review also sits at `in_review`
   * (no approval flow moves it on), so reclaiming on age alone would redraft every one each tick,
   * each a billable call. It checks for any response row, not just `ai_generated`: a human or
   * imported reply also means it is not waiting on generation.
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
          // Literal `reviews.id`: a bare-column interpolation would bind to `review_responses.id`.
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
   * No `onConflictDoNothing`: there is no partial unique index for `source = 'ai_generated'` to
   * arbitrate against. Double drafting is prevented by `claimForGeneration`'s CAS (concurrent
   * workers) and `findClassifiedNeedingGeneration`'s `NOT EXISTS` (a claim released back to `new`).
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
      // `returning` on a plain INSERT always yields the row; fail loudly so the caller knows to
      // release its generation claim.
      throw new Error(MESSAGES.REVIEWS.GENERATED_RESPONSE_INSERT_FAILED(input.reviewId));
    }
    return inserted.id;
  }

  /** Kept local: `.returning()` and `.select()` take the same shape but not the same builder call. */
  private static readonly RETURNING_COLUMNS = {
    id: schema.reviewResponses.id,
    reviewId: schema.reviewResponses.reviewId,
    generationGroupId: schema.reviewResponses.generationGroupId,
    responseType: schema.reviewResponses.responseType,
    content: schema.reviewResponses.content,
    originalContent: schema.reviewResponses.originalContent,
    source: schema.reviewResponses.source,
    status: schema.reviewResponses.status,
    createdByUserId: schema.reviewResponses.createdByUserId,
    approvedByUserId: schema.reviewResponses.approvedByUserId,
    rejectedByUserId: schema.reviewResponses.rejectedByUserId,
    createdAt: schema.reviewResponses.createdAt,
    decidedAt: schema.reviewResponses.decidedAt,
    postedAt: schema.reviewResponses.postedAt,
    errorMessage: schema.reviewResponses.errorMessage,
  } as const;

  /**
   * CAS on `status = 'pending_approval'`: an already-decided response returns `null` (the caller
   * maps it to 409) rather than overwriting a settled decision. May raise a 23505 on
   * `idx_review_responses_review_id_live_reply` if a sibling won the race; it propagates to the DB service.
   */
  async approveResponse(
    tx: DrizzleTransaction,
    input: ApproveResponseInput
  ): Promise<ReviewResponseRow | null> {
    const rows = await tx
      .update(schema.reviewResponses)
      .set({
        status: ResponseStatus.APPROVED,
        content: input.content,
        source: input.source,
        approvedByUserId: input.approvedByUserId,
        decidedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.reviewResponses.id, input.responseId),
          eq(schema.reviewResponses.reviewId, input.reviewId),
          eq(schema.reviewResponses.tenantId, input.tenantId),
          eq(schema.reviewResponses.status, ResponseStatus.PENDING_APPROVAL)
        )
      )
      .returning(ReviewSyncRepository.RETURNING_COLUMNS);

    return (rows[0] as ReviewResponseRow | undefined) ?? null;
  }

  /** Same CAS as `approveResponse`; no live-reply index to guard since `rejected` is outside it. */
  async rejectResponse(
    tx: DrizzleTransaction,
    input: RejectResponseInput
  ): Promise<ReviewResponseRow | null> {
    const rows = await tx
      .update(schema.reviewResponses)
      .set({
        status: ResponseStatus.REJECTED,
        rejectedByUserId: input.rejectedByUserId,
        decidedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.reviewResponses.id, input.responseId),
          eq(schema.reviewResponses.reviewId, input.reviewId),
          eq(schema.reviewResponses.tenantId, input.tenantId),
          eq(schema.reviewResponses.status, ResponseStatus.PENDING_APPROVAL)
        )
      )
      .returning(ReviewSyncRepository.RETURNING_COLUMNS);

    return (rows[0] as ReviewResponseRow | undefined) ?? null;
  }

  /**
   * Supersedes every other `pending_approval`/`post_failed` response on the review, not just the
   * same `generationGroupId`: a review has one live reply regardless of grouping.
   */
  async supersedeSiblingDrafts(
    tx: DrizzleTransaction,
    input: { reviewId: string; excludeResponseId: string }
  ): Promise<string[]> {
    const rows = await tx
      .update(schema.reviewResponses)
      .set({ status: ResponseStatus.SUPERSEDED, decidedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.reviewResponses.reviewId, input.reviewId),
          ne(schema.reviewResponses.id, input.excludeResponseId),
          // A `post_failed` sibling is dead once another reply is chosen; its Retry could only 409.
          inArray(schema.reviewResponses.status, [
            ResponseStatus.PENDING_APPROVAL,
            ResponseStatus.POST_FAILED,
          ])
        )
      )
      .returning({ id: schema.reviewResponses.id });

    return rows.map(row => row.id);
  }

  /**
   * Only tenants with an explicit `review_data_retention_months` are touched; there is deliberately
   * no platform default, so nobody is purged against a number they never chose.
   *
   * `rating`/`review_text`/`classification` stay (the business still needs "a 2-star review in
   * March"); only the link to a person goes. `external_reviewer_id` is nulled too so nothing
   * re-identifies the reviewer pseudonymously.
   *
   * `COALESCE(reviewed_at, created_at)` is load-bearing: `reviewed_at` is nullable and a comparison
   * against NULL is never true, so an undated review would be un-purgeable.
   *
   * `anonymized_at IS NULL` keeps that column the true first-anonymized timestamp.
   *
   * The advisory lock exists because `@Cron` fires on every worker replica, so several can enqueue
   * this job for one tick; the second then waits and finds nothing left to match.
   */
  async purgeExpiredReviewerPii(): Promise<number> {
    return this.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('reviews:retention-purge'), 0)`);

      // `review_data_retention_months` is unbounded at the API layer (huge means "keep forever"), but
      // `now() - (N || ' months')::interval` overflows the timestamp range around 100,000 months and
      // would abort this cross-tenant UPDATE for every tenant. LEAST clamps only the interval
      // arithmetic, never the stored value; 10,000 months (~833 years) changes no real purge decision.
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

      return result.rows.length;
    });
  }

  /** Erased-tenant counterpart of `purgeExpiredReviewerPii`: every review, regardless of retention. Idempotent: a row keeps its first `anonymized_at`. */
  async anonymizeReviewerPiiForTenant(tenantId: string): Promise<number> {
    const result = await this.dbService.db.execute(sql`
      UPDATE reviews
      SET reviewer_name = NULL,
          external_reviewer_id = NULL,
          anonymized_at = now(),
          updated_at = now()
      WHERE tenant_id = ${tenantId}::uuid
        AND anonymized_at IS NULL
      RETURNING id
    `);
    return result.rows.length;
  }

  /**
   * CAS claim on an `approved` response before calling Google, with stale reclaim like
   * `acquireSyncRun`: a worker that crashed after setting `post_attempted_at` leaves it set until a
   * terminal write clears it, so a later attempt may reclaim after `POST_CLAIM_STALE_MINUTES`. Zero
   * rows means not `approved`, or another attempt is presumably in flight; the caller logs and returns.
   */
  async claimResponseForPosting(
    input: ClaimResponseForPostingInput
  ): Promise<ReviewResponseRow | null> {
    const rows = await this.dbService.db
      .update(schema.reviewResponses)
      .set({ postAttemptedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.reviewResponses.id, input.responseId),
          eq(schema.reviewResponses.tenantId, input.tenantId),
          eq(schema.reviewResponses.status, ResponseStatus.APPROVED),
          sql`(${schema.reviewResponses.postAttemptedAt} IS NULL OR ${schema.reviewResponses.postAttemptedAt} < now() - interval '${sql.raw(String(POST_CLAIM_STALE_MINUTES))} minutes')`
        )
      )
      .returning(ReviewSyncRepository.RETURNING_COLUMNS);

    return (rows[0] as ReviewResponseRow | undefined) ?? null;
  }

  /** Every "a live reply now exists" write ends here. */
  async markReviewResponded(tx: DrizzleTransaction, reviewId: string): Promise<void> {
    await tx
      .update(schema.reviews)
      .set({ status: ReviewStatus.RESPONDED, updatedAt: sql`now()` })
      .where(eq(schema.reviews.id, reviewId));
  }

  /** CAS `approved -> posted` plus the parent review to `responded`, in one transaction. `postedAt` is Google's `reviewReply.updateTime`, not `now()`, matching backfill-imported rows. */
  async markResponsePosted(
    tx: DrizzleTransaction,
    input: MarkResponsePostedInput
  ): Promise<ReviewResponseRow | null> {
    const rows = await tx
      .update(schema.reviewResponses)
      .set({
        status: ResponseStatus.POSTED,
        postedAt: input.postedAt,
        postAttemptedAt: null,
        errorMessage: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.reviewResponses.id, input.responseId),
          eq(schema.reviewResponses.status, ResponseStatus.APPROVED)
        )
      )
      .returning(ReviewSyncRepository.RETURNING_COLUMNS);

    const posted = rows[0];
    if (!posted) {
      return null;
    }

    await this.markReviewResponded(tx, input.reviewId);

    return posted as ReviewResponseRow;
  }

  /**
   * Gives a claim back without changing status, for abandonments that are not the response's fault
   * (a rescheduled transient provider error). `false` means it was no longer `approved`.
   */
  async releaseResponseClaim(input: ClaimResponseForPostingInput): Promise<boolean> {
    const rows = await this.dbService.db
      .update(schema.reviewResponses)
      .set({ postAttemptedAt: null, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.reviewResponses.id, input.responseId),
          eq(schema.reviewResponses.tenantId, input.tenantId),
          eq(schema.reviewResponses.status, ResponseStatus.APPROVED)
        )
      )
      .returning({ id: schema.reviewResponses.id });

    return rows.length > 0;
  }

  /**
   * Reviews still waiting on a reply (`new`/`in_review`) that existed before `createdBefore`, as external id → row id.
   * The cutoff keeps a review imported moments ago, which a listing taken a beat earlier may not show, out of a
   * "Google no longer lists it" decision.
   */
  async findOpenReviewsForReconciliation(input: {
    locationId: string;
    createdBefore: string;
  }): Promise<{ id: string; externalReviewId: string }[]> {
    return this.dbService.db
      .select({ id: schema.reviews.id, externalReviewId: schema.reviews.externalReviewId })
      .from(schema.reviews)
      .where(
        and(
          eq(schema.reviews.locationId, input.locationId),
          inArray(schema.reviews.status, [ReviewStatus.NEW, ReviewStatus.IN_REVIEW]),
          isNull(schema.reviews.removedUpstreamAt),
          lt(schema.reviews.createdAt, input.createdBefore)
        )
      );
  }

  /** Only open reviews move: one already answered or dismissed keeps its status. */
  async markReviewsRemovedUpstream(reviewIds: string[]): Promise<number> {
    if (reviewIds.length === 0) {
      return 0;
    }
    const rows = await this.dbService.db
      .update(schema.reviews)
      .set({ removedUpstreamAt: sql`now()`, status: ReviewStatus.REMOVED, updatedAt: sql`now()` })
      .where(
        and(
          inArray(schema.reviews.id, reviewIds),
          inArray(schema.reviews.status, [ReviewStatus.NEW, ReviewStatus.IN_REVIEW])
        )
      )
      .returning({ id: schema.reviews.id });
    return rows.length;
  }

  /** The same transition `upsertReview` makes for a review Google lists again: back to `in_review` with drafts, else `new`. */
  async restoreRelistedReviews(input: {
    locationId: string;
    externalReviewIds: string[];
  }): Promise<number> {
    if (input.externalReviewIds.length === 0) {
      return 0;
    }
    const rows = await this.dbService.db
      .update(schema.reviews)
      .set({
        removedUpstreamAt: null,
        status: sql`(CASE WHEN EXISTS (
          SELECT 1 FROM ${schema.reviewResponses} WHERE ${schema.reviewResponses.reviewId} = reviews.id
        ) THEN ${ReviewStatus.IN_REVIEW} ELSE ${ReviewStatus.NEW} END)::review_status`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.reviews.locationId, input.locationId),
          eq(schema.reviews.status, ReviewStatus.REMOVED),
          inArray(schema.reviews.externalReviewId, input.externalReviewIds)
        )
      )
      .returning({ id: schema.reviews.id });
    return rows.length;
  }

  /** First sighting wins: an already-set timestamp is left as it was. */
  async markReviewRemovedUpstream(input: { reviewId: string; tenantId: string }): Promise<void> {
    await this.dbService.db
      .update(schema.reviews)
      .set({ removedUpstreamAt: sql`now()`, status: ReviewStatus.REMOVED, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.reviews.id, input.reviewId),
          eq(schema.reviews.tenantId, input.tenantId),
          isNull(schema.reviews.removedUpstreamAt)
        )
      );
  }

  /** CAS `approved -> post_failed`, recording the provider's own error text for the retry UI. */
  async markResponsePostFailed(
    input: MarkResponsePostFailedInput
  ): Promise<ReviewResponseRow | null> {
    const rows = await this.dbService.db
      .update(schema.reviewResponses)
      .set({
        status: ResponseStatus.POST_FAILED,
        errorMessage: toStoredMessage(input.errorMessage),
        postAttemptedAt: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.reviewResponses.id, input.responseId),
          eq(schema.reviewResponses.status, ResponseStatus.APPROVED)
        )
      )
      .returning(ReviewSyncRepository.RETURNING_COLUMNS);

    return (rows[0] as ReviewResponseRow | undefined) ?? null;
  }

  /**
   * Abort path when the freshness check finds a reply live on Google that this response did not
   * write (an owner replying directly, or this response's own earlier attempt that crashed before
   * `markResponsePosted` committed; the caller tells them apart by content). CAS `approved ->
   * superseded`, then imports Google's reply. Returns `false` if the response was no longer
   * `approved`. Also sets the review `responded`, else it would sit in the pending queue though answered.
   */
  async supersedeForExternalReply(
    tx: DrizzleTransaction,
    input: SupersedeForExternalReplyInput
  ): Promise<boolean> {
    const rows = await tx
      .update(schema.reviewResponses)
      .set({
        status: ResponseStatus.SUPERSEDED,
        decidedAt: sql`now()`,
        postAttemptedAt: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.reviewResponses.id, input.responseId),
          eq(schema.reviewResponses.status, ResponseStatus.APPROVED)
        )
      )
      .returning({ id: schema.reviewResponses.id });

    if (rows.length === 0) {
      return false;
    }

    await this.insertImportedReply(tx, {
      tenantId: input.tenantId,
      reviewId: input.reviewId,
      content: input.content,
      postedAt: input.postedAt,
    });

    await this.markReviewResponded(tx, input.reviewId);

    return true;
  }

  /** `post_failed -> approved`; clears `error_message` and `post_attempted_at` so it is immediately claimable. */
  async retryPostableResponse(
    input: RetryPostableResponseInput
  ): Promise<ReviewResponseRow | null> {
    const rows = await this.dbService.db
      .update(schema.reviewResponses)
      .set({
        status: ResponseStatus.APPROVED,
        errorMessage: null,
        postAttemptedAt: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.reviewResponses.id, input.responseId),
          eq(schema.reviewResponses.tenantId, input.tenantId),
          eq(schema.reviewResponses.status, ResponseStatus.POST_FAILED)
        )
      )
      .returning(ReviewSyncRepository.RETURNING_COLUMNS);

    return (rows[0] as ReviewResponseRow | undefined) ?? null;
  }

  /**
   * Lands directly at `approved`: the author is the approver, so a self-approval step would be
   * theatre. May raise a 23505 on `idx_review_responses_review_id_live_reply`; it propagates to the service.
   */
  async insertManualReply(
    tx: DrizzleTransaction,
    input: InsertManualReplyInput
  ): Promise<ReviewResponseRow> {
    const rows = await tx
      .insert(schema.reviewResponses)
      .values({
        tenantId: input.tenantId,
        reviewId: input.reviewId,
        responseType: input.responseType,
        content: input.content,
        source: ResponseSource.HUMAN_MANUAL,
        status: ResponseStatus.APPROVED,
        createdByUserId: input.createdByUserId,
        approvedByUserId: input.createdByUserId,
        decidedAt: sql`now()`,
      })
      .returning(ReviewSyncRepository.RETURNING_COLUMNS);

    const inserted = rows[0];
    if (!inserted) {
      throw new Error(MESSAGES.REVIEWS.MANUAL_REPLY_INSERT_FAILED(input.reviewId));
    }
    return inserted as ReviewResponseRow;
  }
}
