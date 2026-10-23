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

/** The other partial unique index on review_responses.review_id; see writeReviewPage's catch. */
const LIVE_REPLY_INDEX = 'idx_review_responses_review_id_live_reply';

/** `UNIQUE (location_id) WHERE status = 'running'` — named by the 23505 a concurrent second run raises. */
const SYNC_RUN_RUNNING_INDEX = 'idx_sync_runs_location_id_running';

/** How recent an unreplied review must be to enter the live pipeline as backlog rather than closed history. */
const BACKFILL_ACTIONABLE_WINDOW_DAYS = 60;

/** `SyncHealthStatus` has no `running`; mapped rather than cast so widening the source union fails to compile. */
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
   * Returns `null`, not an error, when a run is already active for this location: the previous poll
   * or a backfill simply hasn't finished, which is benign and not worth a retry or DLQ entry.
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

  /** Each review and its imported reply are written together, so a crash leaves no review without its reply. */
  importPage(input: ImportPageInput): Promise<ImportPageResult> {
    return this.writeReviewPage(input, review => this.resolveBackfillStatus(review));
  }

  /**
   * No age-based write-off (a review first seen by the poller is live backlog however old), but a
   * reply already on it still yields `responded`: queueing an answered review would risk an AI
   * draft posted over the owner's own words, and `new` + a `posted` imported reply is contradictory.
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

        const { reply } = review;
        if (!reply) {
          return { inserted, replyImported: false, replyConflict: false };
        }

        try {
          // A savepoint: once a statement raises 23505 Postgres aborts the whole transaction, so catching it on `tx` itself
          // would turn the commit into a silent ROLLBACK and drop the review upsert above. The nested transaction rolls back
          // to the savepoint only, leaving the upsert committed.
          const replyImported = await tx.transaction(nested =>
            this.reviewSyncRepository.insertImportedReply(nested, {
              tenantId: input.tenantId,
              reviewId: id,
              content: reply.comment,
              postedAt: reply.updatedAt,
            })
          );

          // Whether Google's reply was just stored or was already, the review is answered; open drafts for it are obsolete.
          await this.reviewSyncRepository.markRespondedByExternalReply(tx, id);

          return { inserted, replyImported, replyConflict: false };
        } catch (error) {
          // `review_responses` has two partial unique indexes on `review_id` (imported, and
          // approved/posted); ON CONFLICT names only one arbiter, so a live-pipeline row can raise
          // a 23505 on the other. Count it: swallowing it would be silent data loss in an `ok` run.
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
   * Replied (any age) -> `responded`. Unreplied within the window -> `new`, real backlog. Older ->
   * `dismissed`, which keeps it out of classification/drafting without a special case elsewhere;
   * note that elsewhere `dismissed` means a human did it, here no human acted.
   */
  private resolveBackfillStatus(review: ImportReviewInput): ReviewStatus {
    if (review.reply) {
      return ReviewStatus.RESPONDED;
    }

    const ageMs = Date.now() - new Date(review.reviewedAt).getTime();
    const windowMs = BACKFILL_ACTIONABLE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    return ageMs <= windowMs ? ReviewStatus.NEW : ReviewStatus.DISMISSED;
  }

  noteRunWaiting(syncRunId: string, message: string): Promise<void> {
    return this.reviewSyncRepository.noteSyncRunWaiting(syncRunId, message);
  }

  recordProgress(
    syncRunId: string,
    input: { reviewsFetched: number; reviewsTotal?: number | undefined }
  ): Promise<void> {
    return this.reviewSyncRepository.recordSyncProgress(syncRunId, input);
  }

  /**
   * `false` means the row was not in `error` (the caller then fails the attempt rather than write
   * completion state for a run it cannot prove it owns), or a 23505 on the running index: reopening
   * flips the row to `running`, and a poll or second backfill may already be running.
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
   * Snapshot, cursor and `onboarding_backfill_completed_at` (which un-gates polling) are written
   * only on a won CAS: a lost one means the run was reclaimed as stale and another is redoing the
   * work, so stamping completion would tell the owner "all set" mid-import.
   *
   * `lastReviewSyncedAt` advances from both triggers so the first poll only fetches what is newer
   * than backfill's cutoff. `null` leaves the cursor untouched.
   */
  async completeRun(input: {
    syncRunId: string;
    locationId: string;
    status: SyncRunStatus.ERROR | SyncRunStatus.OK;
    /** Omit rather than pass a stale count when none is authoritative (a mid-import failure). */
    reviewsFetched?: number;
    errorMessage: string | null;
    markBackfillComplete: boolean;
    lastReviewSyncedAt: string | null;
  }): Promise<boolean> {
    const stillOwned = await this.reviewSyncRepository.completeSyncRun(input.syncRunId, {
      status: input.status,
      ...(input.reviewsFetched !== undefined ? { reviewsFetched: input.reviewsFetched } : {}),
      errorMessage: input.errorMessage,
      // Only a clean, fully-finished backfill overwrites `reviews_total` with its final count.
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
   * One transaction, so a crash never leaves both an approval and a stale pending sibling. The
   * live-reply unique violation deliberately propagates: `ReviewsService.approveReply` maps it.
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

  purgeExpiredReviewerPii(): Promise<number> {
    return this.reviewSyncRepository.purgeExpiredReviewerPii();
  }

  anonymizeReviewerPiiForTenant(tenantId: string): Promise<number> {
    return this.reviewSyncRepository.anonymizeReviewerPiiForTenant(tenantId);
  }

  countAiGeneratedResponsesThisMonth(tenantId: string, monthStart: string): Promise<number> {
    return this.reviewsReadRepository.countAiGeneratedResponsesThisMonth(tenantId, monthStart);
  }

  findClassifiedNeedingGeneration(
    tenantId: string,
    locationId: string,
    limit: number
  ): Promise<GenerationCandidateRow[]> {
    return this.reviewSyncRepository.findClassifiedNeedingGeneration(tenantId, locationId, limit);
  }

  claimForGeneration(reviewId: string): Promise<boolean> {
    return this.reviewSyncRepository.claimForGeneration(reviewId);
  }

  releaseGenerationClaimAfterFailure(
    reviewId: string,
    countAttempt = true
  ): Promise<number | null> {
    return this.reviewSyncRepository.releaseGenerationClaimAfterFailure(reviewId, countAttempt);
  }

  reclaimStaleGenerationClaims(locationId: string): Promise<number> {
    return this.reviewSyncRepository.reclaimStaleGenerationClaims(locationId);
  }

  insertGeneratedResponse(input: InsertGeneratedResponseInput): Promise<string> {
    return this.reviewSyncRepository.insertGeneratedResponse(input);
  }

  claimResponseForPosting(input: ClaimResponseForPostingInput): Promise<ReviewResponseRow | null> {
    return this.reviewSyncRepository.claimResponseForPosting(input);
  }

  releaseResponseClaim(input: ClaimResponseForPostingInput): Promise<boolean> {
    return this.reviewSyncRepository.releaseResponseClaim(input);
  }

  /**
   * For a reply live on Google whose response can no longer be marked `posted` (a human rejected or
   * edited it mid-flight): imports what Google has so the record matches what is public. `false`
   * when a live reply is already on record.
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

  markResponsePosted(input: MarkResponsePostedInput): Promise<ReviewResponseRow | null> {
    return this.reviewSyncRepository.transaction(tx =>
      this.reviewSyncRepository.markResponsePosted(tx, input)
    );
  }

  findOpenReviewsForReconciliation(input: {
    locationId: string;
    createdBefore: string;
  }): Promise<{ id: string; externalReviewId: string }[]> {
    return this.reviewSyncRepository.findOpenReviewsForReconciliation(input);
  }

  markReviewsRemovedUpstream(reviewIds: string[]): Promise<number> {
    return this.reviewSyncRepository.markReviewsRemovedUpstream(reviewIds);
  }

  restoreRelistedReviews(input: {
    locationId: string;
    externalReviewIds: string[];
  }): Promise<number> {
    return this.reviewSyncRepository.restoreRelistedReviews(input);
  }

  /** Recorded when Google answers 404 for the review: its author deleted it there. */
  markReviewRemovedUpstream(input: { reviewId: string; tenantId: string }): Promise<void> {
    return this.reviewSyncRepository.markReviewRemovedUpstream(input);
  }

  markResponsePostFailed(input: MarkResponsePostFailedInput): Promise<ReviewResponseRow | null> {
    return this.reviewSyncRepository.markResponsePostFailed(input);
  }

  supersedeForExternalReply(input: SupersedeForExternalReplyInput): Promise<boolean> {
    return this.reviewSyncRepository.transaction(tx =>
      this.reviewSyncRepository.supersedeForExternalReply(tx, input)
    );
  }

  retryPostableResponse(input: RetryPostableResponseInput): Promise<ReviewResponseRow | null> {
    return this.reviewSyncRepository.retryPostableResponse(input);
  }

  /** Same transaction as `supersedeSiblingDrafts`, so a crash never leaves a live reply plus a stale pending sibling. */
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
