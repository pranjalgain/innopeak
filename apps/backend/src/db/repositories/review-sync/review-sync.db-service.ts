import { ReviewStatus } from '@common/enums/review-status.enum';
import { SyncHealthStatus } from '@common/enums/sync-health-status.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { Injectable, Logger } from '@nestjs/common';

import { ReviewSyncRepository } from './review-sync.repository';
import { ReviewsReadRepository } from './reviews-read.repository';
import type {
  ApproveResponseInput,
  ClaimResponseForPostingInput,
  FindResponseForTenantInput,
  FindResponsesForReviewsInput,
  FindReviewByIdForTenantInput,
  GenerationCandidateRow,
  GetPromptVersionStatsBatchInput,
  GetPromptVersionStatsInput,
  ImportLiveReplyInput,
  ImportPageInput,
  ImportPageResult,
  ImportReviewInput,
  InsertGeneratedResponseInput,
  InsertManualReplyInput,
  ListReviewsFilter,
  MarkResponsePostedInput,
  MarkResponsePostFailedInput,
  PromptVersionStatsBatchRow,
  PromptVersionStatsRow,
  RejectResponseInput,
  RetryPostableResponseInput,
  ReviewResponseRow,
  ReviewRow,
  SupersedeForExternalReplyInput,
  SyncRunRow,
} from './types/review-sync.type';

import { ConnectionsRepository } from '../connections/connections.repository';

/** The *other* partial unique index on review_responses.review_id — see importPage's catch. */
const LIVE_REPLY_INDEX = 'idx_review_responses_review_id_live_reply';

/** `UNIQUE (location_id) WHERE status = 'running'` — the index Postgres names on the 23505 a
 * concurrent second run raises. `ConnectionsDbService.confirmLocation` guards the same index for
 * backfill; `acquireSyncRun` below guards it for poll. */
const SYNC_RUN_RUNNING_INDEX = 'idx_sync_runs_location_id_running';

/**
 * How recent an unreplied review must be to enter the live pipeline as actionable backlog,
 * rather than being written off as closed history. See `resolveBackfillStatus`'s doc comment for
 * the full reasoning. A fixed constant for now — the same shape as `tenant_settings
 * .escalation_rating_threshold` would make this a per-tenant choice, which is a reasonable
 * follow-up once someone actually asks for it, not a speculative addition here.
 */
const BACKFILL_ACTIONABLE_WINDOW_DAYS = 60;

/**
 * `sync_runs.status` and `locations.last_sync_status` are different columns with different value
 * sets — `SyncHealthStatus` has no `running` by design. Mapped explicitly rather than cast so
 * widening the source union here becomes a compile error instead of writing `running` into a
 * column that has no such value.
 */
const RUN_STATUS_TO_HEALTH: Record<SyncRunStatus.ERROR | SyncRunStatus.OK, SyncHealthStatus> = {
  [SyncRunStatus.OK]: SyncHealthStatus.OK,
  [SyncRunStatus.ERROR]: SyncHealthStatus.ERROR,
};

@Injectable()
export class ReviewSyncDbService {
  private readonly logger = new Logger(ReviewSyncDbService.name);

  constructor(
    private readonly reviewSyncRepository: ReviewSyncRepository,
    private readonly reviewsReadRepository: ReviewsReadRepository,
    private readonly connectionsRepository: ConnectionsRepository
  ) {}

  /**
   * Acquires a `sync_runs` row for a poll — the same CAS-and-reclaim `ReviewSyncRepository`
   * method (`acquireSyncRun`, PLAN.md §8.1) `ConnectionsDbService.confirmLocation` already uses
   * for backfill, wrapped here so `ReviewSyncQueueService.runPoll` can call it without reaching
   * into a Repository directly.
   *
   * Returns `null`, not a thrown error, when a run is already genuinely active for this location.
   * That is an expected, benign outcome for a 15-minute cron fan-out — the previous poll (or a
   * still-running backfill) simply hasn't finished yet — not a failure worth a job retry or a DLQ
   * entry the way an unexpected exception would be.
   */
  async acquireSyncRun(input: {
    tenantId: string;
    locationId: string;
    trigger: SyncTrigger;
  }): Promise<SyncRunRow | null> {
    try {
      return await this.reviewSyncRepository.transaction(tx =>
        this.reviewSyncRepository.acquireSyncRun(tx, input)
      );
    } catch (error) {
      if (isUniqueViolation(error, SYNC_RUN_RUNNING_INDEX)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Writes one provider page from backfill. Each review and its imported reply go in together, so
   * a crash mid-page leaves whole reviews behind rather than reviews whose replies vanished.
   *
   * **Status deviates from PLAN.md §7 on purpose — see `resolveBackfillStatus`.** §7 specifies
   * `status = 'responded'` unconditionally for every backfilled review, which is right that
   * historical review should not flood a new owner with drafts, but wrong that a review nobody
   * ever answered should display as "Responded." The resolution here is recency, not
   * reply-presence alone: a genuinely unanswered *recent* review is exactly the backlog this
   * product exists to help clear, so it enters the live pipeline as `new` like anything the
   * poller would bring in; an unanswered *old* review is closed history, same as before.
   */
  importPage(input: ImportPageInput): Promise<ImportPageResult> {
    return this.writeReviewPage(input, review => this.resolveBackfillStatus(review));
  }

  /**
   * The poll counterpart to `importPage`. Differs from `resolveBackfillStatus` on exactly one
   * dimension and matches it on the other:
   *
   *  - **No age-based write-off.** `resolveBackfillStatus`'s `dismissed` branch exists to stop
   *    years of historical import flooding a new owner with drafts; a review the poller just saw
   *    for the first time is live backlog no matter how long ago it was written, so it is `new`.
   *  - **Reply presence is still honoured.** A first-sighted review can legitimately arrive with
   *    the owner's reply already on it — they replied on Google within one poll interval, or the
   *    poller was behind. Writing `new` there would queue a review the owner has already answered
   *    for classification and (once generation exists) an AI draft, and PLAN.md §8.12 is explicit
   *    that posting over an owner's own words is the worst outcome in this system. The imported
   *    reply is written alongside it either way, so `new` + a `posted` imported reply is a
   *    contradiction the row should never hold.
   */
  importPollPage(input: ImportPageInput): Promise<ImportPageResult> {
    return this.writeReviewPage(input, review => {
      return review.reply ? ReviewStatus.RESPONDED : ReviewStatus.NEW;
    });
  }

  private async writeReviewPage(
    input: ImportPageInput,
    resolveStatus: (review: ImportReviewInput) => ReviewStatus
  ): Promise<ImportPageResult> {
    let reviewsWritten = 0;
    let reviewsInserted = 0;
    let repliesImported = 0;
    let repliesSkippedConflict = 0;

    for (const review of input.reviews) {
      const result = await this.reviewSyncRepository.transaction(async tx => {
        const { id, inserted } = await this.reviewSyncRepository.upsertReview(tx, {
          tenantId: input.tenantId,
          locationId: input.locationId,
          externalReviewId: review.externalReviewId,
          externalReviewerId: review.externalReviewerId,
          rating: review.rating,
          reviewText: review.text,
          reviewerName: review.reviewerName,
          reviewedAt: review.reviewedAt,
          externalUpdatedAt: review.externalUpdatedAt,
          status: resolveStatus(review),
        });

        if (!review.reply) {
          return { inserted, replyImported: false, replyConflict: false };
        }

        try {
          const replyImported = await this.reviewSyncRepository.insertImportedReply(tx, {
            tenantId: input.tenantId,
            reviewId: id,
            content: review.reply.comment,
            postedAt: review.reply.updatedAt,
          });

          return { inserted, replyImported, replyConflict: false };
        } catch (error) {
          // `review_responses` carries TWO partial unique indexes on `review_id`: one for
          // `source = 'imported'` and one for `status IN ('approved','posted')`. An imported
          // reply is `status = 'posted'`, so it matches both — but ON CONFLICT names only one
          // arbiter, so a row written by the live pipeline can raise a 23505 on the *other*
          // index that the ON CONFLICT clause cannot absorb. Counting it keeps the outcome
          // visible; swallowing it silently would be data loss the run still reports as `ok`.
          if (isUniqueViolation(error, LIVE_REPLY_INDEX)) {
            return { inserted, replyImported: false, replyConflict: true };
          }
          throw error;
        }
      });

      reviewsWritten += 1;
      if (result.inserted) reviewsInserted += 1;
      if (result.replyImported) repliesImported += 1;
      if (result.replyConflict) repliesSkippedConflict += 1;
    }

    if (repliesSkippedConflict > 0) {
      this.logger.warn(
        `${repliesSkippedConflict} imported replies for location ${input.locationId} were skipped: a live reply already exists for those reviews.`
      );
    }

    return { reviewsWritten, reviewsInserted, repliesImported, repliesSkippedConflict };
  }

  /**
   * The backfill's status rule, and the one deliberate deviation from PLAN.md §7 in this module.
   *
   * §7 says every backfilled review is `status = 'responded'`, full stop — "historical record …
   * not items that need routing or approval." That protects against the real failure mode it
   * names (a day-one owner flooded with drafts for a decade of old reviews), but it also means a
   * genuinely unanswered review from last week is written off identically to one from four years
   * ago — and an unanswered *recent* review is precisely the backlog this product exists to help
   * clear, not dead weight to hide.
   *
   * Three-way split instead of two:
   *  - has an approved public reply → `responded`, any age. Nothing to draft; the tenant already
   *    answered it.
   *  - no reply (or one Google rejected) but **within** `BACKFILL_ACTIONABLE_WINDOW_DAYS` →
   *    `new`. Enters the live pipeline exactly like a review the poller just brought in — it will
   *    be classified and drafted once that stage exists, same as any other `new` row.
   *  - no reply and **older** than the window → `dismissed`. Closed history, same as before;
   *    excluded from classification/drafting because it never reaches `new`, not by any special
   *    case elsewhere in the pipeline.
   *
   * `dismissed` here still carries the caveat recorded in `reviews/overview.md`: elsewhere in this
   * system it means a human explicitly dismissed the review, and these rows reach it with no
   * human action at all. That tradeoff is now scoped to genuinely old history rather than every
   * unreplied review, which is the whole point of adding the window.
   */
  private resolveBackfillStatus(review: ImportReviewInput): ReviewStatus {
    if (review.reply) {
      return ReviewStatus.RESPONDED;
    }

    const ageMs = Date.now() - new Date(review.reviewedAt).getTime();
    const windowMs = BACKFILL_ACTIONABLE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    return ageMs <= windowMs ? ReviewStatus.NEW : ReviewStatus.DISMISSED;
  }

  recordProgress(
    syncRunId: string,
    input: { reviewsFetched: number; reviewsTotal?: number | undefined }
  ): Promise<void> {
    return this.reviewSyncRepository.recordSyncProgress(syncRunId, input);
  }

  /**
   * See `ReviewSyncRepository.reopenSyncRunForRetry` for why a BullMQ retry needs this at all.
   * `false` means the row was not in `error` — most likely it does not exist, which should not
   * happen for a job carrying an id it was published with; the caller fails the attempt outright
   * rather than proceeding to write completion state against a run it cannot prove it still owns.
   *
   * Also `false` on a 23505 against `idx_sync_runs_location_id_running`: reopening flips the row
   * back to `running`, the same transition every other writer of this partial unique index has to
   * guard (`acquireSyncRun` above, `ConnectionsDbService.confirmLocation`) — a poll or a second
   * backfill can genuinely be running for this location while this retry fires. Left unguarded,
   * this call was the one writer of that index that let the raw 23505 escape instead of the clear
   * "not in a reopenable state" the caller already throws for the same condition.
   */
  async reopenRunForRetry(syncRunId: string): Promise<boolean> {
    try {
      return await this.reviewSyncRepository.reopenSyncRunForRetry(syncRunId);
    } catch (error) {
      if (isUniqueViolation(error, SYNC_RUN_RUNNING_INDEX)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Completes the run, and only on a genuine win writes the location's rolled-up sync snapshot,
   * the poller's high-water mark, and — for a successful backfill — `onboarding_backfill_completed_at`,
   * the column that un-gates live polling. A lost CAS means this run was reclaimed as stale
   * mid-flight and a second run is now redoing the work; letting it stamp completion would tell
   * the owner "all set" for an import still in progress.
   *
   * `lastReviewSyncedAt` seeds/advances from **both** triggers: backfill writes it too (not just
   * `onboarding_backfill_completed_at`), so the location's very first poll only fetches what's
   * newer than backfill's own cutoff instead of re-walking history backfill already imported.
   * `null` (nothing fetched this run, or the run failed) leaves the existing cursor untouched —
   * `ConnectionsRepository.advanceLastReviewSyncedAt` is itself monotonic on top of that.
   */
  async completeRun(input: {
    syncRunId: string;
    locationId: string;
    status: SyncRunStatus.ERROR | SyncRunStatus.OK;
    /** See `ReviewSyncRepository.completeSyncRun` — omit rather than pass a stale count when the caller does not have an authoritative one (a mid-import failure). */
    reviewsFetched?: number;
    errorMessage: string | null;
    markBackfillComplete: boolean;
    lastReviewSyncedAt: string | null;
  }): Promise<boolean> {
    const stillOwned = await this.reviewSyncRepository.completeSyncRun(input.syncRunId, {
      status: input.status,
      ...(input.reviewsFetched !== undefined ? { reviewsFetched: input.reviewsFetched } : {}),
      errorMessage: input.errorMessage,
      // See `ReviewSyncRepository.completeSyncRun` — only a clean, fully-finished backfill
      // should overwrite `reviews_total` with its own final count.
      finalizeReviewsTotal: input.status === SyncRunStatus.OK && input.markBackfillComplete,
    });

    if (!stillOwned) {
      this.logger.warn(
        `Sync run ${input.syncRunId} was reclaimed as stale while running; not recording its result.`
      );
      return false;
    }

    await this.connectionsRepository.updateSyncSnapshot(input.locationId, {
      status: RUN_STATUS_TO_HEALTH[input.status],
      error: input.errorMessage,
    });

    if (input.status === SyncRunStatus.OK && input.markBackfillComplete) {
      await this.connectionsRepository.markBackfillCompleted(input.locationId);
    }

    if (input.status === SyncRunStatus.OK && input.lastReviewSyncedAt !== null) {
      await this.connectionsRepository.advanceLastReviewSyncedAt(
        input.locationId,
        input.lastReviewSyncedAt
      );
    }

    return true;
  }

  findLatestBackfillRun(locationId: string): Promise<SyncRunRow | null> {
    return this.reviewSyncRepository.findLatestRunForLocation(locationId, SyncTrigger.BACKFILL);
  }

  listReviews(filter: ListReviewsFilter): Promise<{ reviews: ReviewRow[]; total: number }> {
    return this.reviewsReadRepository.listReviews(filter);
  }

  findReviewForTenant(input: FindReviewByIdForTenantInput): Promise<ReviewRow | null> {
    return this.reviewsReadRepository.findReviewByIdForTenant(input);
  }

  findResponsesForReviews(input: FindResponsesForReviewsInput): Promise<ReviewResponseRow[]> {
    return this.reviewsReadRepository.findResponsesForReviews(input);
  }

  findResponseForTenant(input: FindResponseForTenantInput): Promise<ReviewResponseRow | null> {
    return this.reviewsReadRepository.findResponseForTenant(input);
  }

  /**
   * Approves a pending draft and, on success, supersedes every other still-pending sibling on the
   * same review — one transaction, so a crash between the two never leaves a review with both a
   * decided approval and a stale pending sibling. `isUniqueViolation` on the live-reply index is
   * deliberately left to propagate uncaught: `ReviewsService.approveReply` is where it's turned
   * into `ReviewResponseAlreadyLiveException`, the same service-not-DB-service split
   * `PromptsService.createVersion` already established for the equivalent prompt-version conflict.
   */
  async approveResponse(input: ApproveResponseInput): Promise<ReviewResponseRow | null> {
    return this.reviewSyncRepository.transaction(async tx => {
      const approved = await this.reviewSyncRepository.approveResponse(tx, input);
      if (!approved) return null;

      await this.reviewSyncRepository.supersedeSiblingDrafts(tx, {
        reviewId: input.reviewId,
        excludeResponseId: input.responseId,
      });

      return approved;
    });
  }

  rejectResponse(input: RejectResponseInput): Promise<ReviewResponseRow | null> {
    return this.reviewSyncRepository.transaction(tx =>
      this.reviewSyncRepository.rejectResponse(tx, input)
    );
  }

  getPromptVersionStats(input: GetPromptVersionStatsInput): Promise<PromptVersionStatsRow | null> {
    return this.reviewsReadRepository.getPromptVersionStats(input);
  }

  getPromptVersionStatsBatch(
    input: GetPromptVersionStatsBatchInput
  ): Promise<PromptVersionStatsBatchRow[]> {
    return this.reviewsReadRepository.getPromptVersionStatsBatch(input);
  }

  /** `PLAN.md` §6's nightly reviewer-retention purge — see `ReviewSyncRepository.purgeExpiredReviewerPii`. */
  purgeExpiredReviewerPii(): Promise<number> {
    return this.reviewSyncRepository.purgeExpiredReviewerPii();
  }

  /** See `ReviewsReadRepository.countAiGeneratedResponsesThisMonth`. */
  countAiGeneratedResponsesThisMonth(tenantId: string, monthStart: string): Promise<number> {
    return this.reviewsReadRepository.countAiGeneratedResponsesThisMonth(tenantId, monthStart);
  }

  /** See `ReviewSyncRepository.findClassifiedNeedingGeneration`. */
  findClassifiedNeedingGeneration(
    tenantId: string,
    locationId: string,
    limit: number
  ): Promise<GenerationCandidateRow[]> {
    return this.reviewSyncRepository.findClassifiedNeedingGeneration(tenantId, locationId, limit);
  }

  /** See `ReviewSyncRepository.claimForGeneration`. */
  claimForGeneration(reviewId: string): Promise<boolean> {
    return this.reviewSyncRepository.claimForGeneration(reviewId);
  }

  /** See `ReviewSyncRepository.releaseGenerationClaim`. */
  releaseGenerationClaim(reviewId: string): Promise<void> {
    return this.reviewSyncRepository.releaseGenerationClaim(reviewId);
  }

  /** See `ReviewSyncRepository.reclaimStaleGenerationClaims`. */
  reclaimStaleGenerationClaims(locationId: string): Promise<number> {
    return this.reviewSyncRepository.reclaimStaleGenerationClaims(locationId);
  }

  /** See `ReviewSyncRepository.insertGeneratedResponse`. */
  insertGeneratedResponse(input: InsertGeneratedResponseInput): Promise<string> {
    return this.reviewSyncRepository.insertGeneratedResponse(input);
  }

  /** See `ReviewSyncRepository.claimResponseForPosting`. */
  claimResponseForPosting(input: ClaimResponseForPostingInput): Promise<ReviewResponseRow | null> {
    return this.reviewSyncRepository.claimResponseForPosting(input);
  }

  /** See `ReviewSyncRepository.releaseResponseClaim`. */
  releaseResponseClaim(input: ClaimResponseForPostingInput): Promise<boolean> {
    return this.reviewSyncRepository.releaseResponseClaim(input);
  }

  /**
   * Records a reply that is demonstrably live on Google when the response that was meant to post it
   * can no longer be marked `posted` (it stopped being `approved` mid-flight — a human rejected or
   * edited it while the worker was talking to Google). Imports what Google actually has, as
   * `insertImportedReply` would, and advances the review to `responded`, so the record matches
   * what is public. Returns `false` when the review already has a live reply on record (the
   * `idx_review_responses_review_id_live_reply` index) — in which case there is nothing to add.
   */
  async importLiveReply(input: ImportLiveReplyInput): Promise<boolean> {
    try {
      return await this.reviewSyncRepository.transaction(async tx => {
        const inserted = await this.reviewSyncRepository.insertImportedReply(tx, input);
        await this.reviewSyncRepository.markReviewResponded(tx, input.reviewId);
        return inserted;
      });
    } catch (error) {
      if (isUniqueViolation(error, LIVE_REPLY_INDEX)) {
        return false;
      }
      throw error;
    }
  }

  /** See `ReviewSyncRepository.markResponsePosted`. */
  markResponsePosted(input: MarkResponsePostedInput): Promise<ReviewResponseRow | null> {
    return this.reviewSyncRepository.transaction(tx =>
      this.reviewSyncRepository.markResponsePosted(tx, input)
    );
  }

  /** See `ReviewSyncRepository.markResponsePostFailed`. */
  markResponsePostFailed(input: MarkResponsePostFailedInput): Promise<ReviewResponseRow | null> {
    return this.reviewSyncRepository.markResponsePostFailed(input);
  }

  /** See `ReviewSyncRepository.supersedeForExternalReply`. */
  supersedeForExternalReply(input: SupersedeForExternalReplyInput): Promise<boolean> {
    return this.reviewSyncRepository.transaction(tx =>
      this.reviewSyncRepository.supersedeForExternalReply(tx, input)
    );
  }

  /** See `ReviewSyncRepository.retryPostableResponse`. */
  retryPostableResponse(input: RetryPostableResponseInput): Promise<ReviewResponseRow | null> {
    return this.reviewSyncRepository.retryPostableResponse(input);
  }

  /** See `ReviewSyncRepository.insertManualReply` — wrapped in the same transaction as
   *  `supersedeSiblingDrafts`, mirroring `approveResponse`'s own shape, so a crash between the two
   *  never leaves a review with both a new live reply and a stale pending sibling. */
  async insertManualReply(
    input: InsertManualReplyInput
  ): Promise<{ response: ReviewResponseRow; supersededResponseIds: string[] }> {
    return this.reviewSyncRepository.transaction(async tx => {
      const inserted = await this.reviewSyncRepository.insertManualReply(tx, input);

      const supersededResponseIds = await this.reviewSyncRepository.supersedeSiblingDrafts(tx, {
        reviewId: input.reviewId,
        excludeResponseId: inserted.id,
      });

      return { response: inserted, supersededResponseIds };
    });
  }
}
