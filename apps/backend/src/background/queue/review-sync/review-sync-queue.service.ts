import { AiReplyGenerationService } from '@ai/ai-reply-generation.service';
import { IReviewBackfillJob, IReviewSyncJob } from '@bg/interfaces/job.interface';
import type {
  ClassifyAndGenerateOutcome,
  ImportOutcome,
  PollImportOutcome,
} from '@bg/types/background.type';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import { Injectable, Logger } from '@nestjs/common';
import { ReviewClassificationService } from '@review-pipeline/review-classification.service';
import type { ClassifyPendingReviewsResult } from '@review-pipeline/types/classification-result.type';
import {
  GBP_REVIEWS_PAGE_SIZE,
  RATE_LIMIT_DEFAULT_WAIT_SECONDS,
  RATE_LIMIT_MAX_RETRIES,
  RATE_LIMIT_MAX_WAIT_SECONDS,
} from '@review-provider/constants/review-provider.constants';
import {
  ProviderAuthError,
  ProviderNotFoundError,
  ProviderRateLimitError,
} from '@review-provider/errors/provider.error';
import { ProviderCredentialService } from '@review-provider/provider-credential.service';
import { ReviewProvider } from '@review-provider/providers/review-provider.provider';

/** Replies imported as few-shot voice examples; stopping here keeps onboarding of an old business
 *  from taking an hour. Backfill-only. */
const IMPORTED_REPLY_TARGET = 50;

/** Backfill's hard stop: a location with thousands of reviews and few replies would otherwise paginate forever looking for a 50th. */
const MAX_PAGES = 20;

/**
 * An order of magnitude above backfill's: a poll must cover everything newer than the cursor, since
 * reviews below it are never revisited. Purely a runaway guard (e.g. a corrupted cursor); hitting it
 * fails the run, see `importNewPages`.
 */
const MAX_POLL_PAGES = 200;

/**
 * Subtracted from the cursor in `importNewPages`'s stop check. Google's `reviews.list` guarantees no
 * stable position across pages, so a review created or edited mid-walk can land on the wrong side of
 * the cutoff and be skipped permanently. Re-walking a small window is harmless: `upsertReview` and
 * `insertImportedReply` are idempotent.
 */
const POLL_CURSOR_OVERLAP_MS = 5 * 60 * 1000;

/** A location's name, address, phone and website are re-read from the provider at most this often. */
const LOCATION_DETAILS_REFRESH_MS = 24 * 60 * 60 * 1000;

/** Google's full review list is compared with ours (to catch deleted reviews) at most this often per location. */
const REVIEW_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** 5,000 reviews at 50 a page. A longer list is not walked: with part of it unseen, "missing" proves nothing. */
const MAX_RECONCILE_PAGES = 100;

/** Reviews imported more recently than this are left out of a "no longer listed" decision. */
const RECONCILE_GRACE_MS = 60 * 60 * 1000;

/** Holds all review-ingestion logic (backfill and poll); the processor and SQS consumer contain none. */
@Injectable()
export class ReviewSyncQueueService {
  private readonly logger = new Logger(ReviewSyncQueueService.name);

  constructor(
    private readonly provider: ReviewProvider,
    private readonly credentialService: ProviderCredentialService,
    private readonly connectionsDbService: ConnectionsDbService,
    private readonly reviewSyncDbService: ReviewSyncDbService,
    private readonly reviewClassificationService: ReviewClassificationService,
    private readonly aiReplyGenerationService: AiReplyGenerationService
  ) {}

  /**
   * `isRetry` (BullMQ `attemptsMade > 0`): a retry reuses the same `sync_runs` row, which the first
   * attempt's catch already moved to `error`. It is reopened first, or a successful retry's
   * `completeRun` (CAS on `status = 'running'`) would match nothing and never mark backfill complete.
   */
  async runBackfill(job: IReviewBackfillJob, isRetry = false): Promise<void> {
    this.logger.log(
      `Starting review backfill for location ${job.locationId} (run ${job.syncRunId})${isRetry ? ' [retry]' : ''}`
    );

    if (isRetry) {
      const reopened = await this.reviewSyncDbService.reopenRunForRetry(job.syncRunId);
      if (!reopened) {
        // Fail loudly: continuing would import reviews under a run id whose completion can never be recorded.
        throw new Error(
          `Cannot retry review backfill for location ${job.locationId}: sync run ${job.syncRunId} is not in a reopenable state.`
        );
      }
    }

    let reviewsFetched = 0;
    let maxExternalUpdatedAt: string | null = null;

    try {
      const accessToken = await this.resolveAccessToken(job);
      const importResult = await this.importAllPages(job, job.syncRunId, accessToken);
      reviewsFetched = importResult.reviewsFetched;
      maxExternalUpdatedAt = importResult.maxExternalUpdatedAt;

      const pipelineOutcome = await this.classifyAndGenerateForImportedReviews(job);

      await this.reviewSyncDbService.completeRun({
        syncRunId: job.syncRunId,
        locationId: job.locationId,
        status: pipelineOutcome.error === null ? SyncRunStatus.OK : SyncRunStatus.ERROR,
        reviewsFetched,
        errorMessage: pipelineOutcome.error,
        // Only a run that finished both halves un-gates live polling; stamping it after a failed
        // pipeline would report `livePollingEnabled: true` while rows are still pending.
        markBackfillComplete: pipelineOutcome.error === null,
        lastReviewSyncedAt: pipelineOutcome.error === null ? maxExternalUpdatedAt : null,
      });

      if (pipelineOutcome.error === null) {
        this.logger.log(
          `Review backfill complete for location ${job.locationId}: ${reviewsFetched} reviews, ${pipelineOutcome.classified} classified (${pipelineOutcome.skipped} skipped), ${pipelineOutcome.generated} drafts generated (${pipelineOutcome.generationFailed} failed${pipelineOutcome.quotaReached ? ', AI-draft quota reached' : ''})`
        );
      } else {
        this.logger.error(
          `Review backfill for location ${job.locationId} imported ${reviewsFetched} reviews but pipelineOutcome failed; live polling stays gated: ${pipelineOutcome.error}`
        );
      }
    } catch (error) {
      const message = await this.handleSyncFailure(job, error);

      await this.reviewSyncDbService.completeRun({
        syncRunId: job.syncRunId,
        locationId: job.locationId,
        status: SyncRunStatus.ERROR,
        // Not `reviewsFetched`: it is stale after a mid-import failure and would overwrite the larger
        // count `recordProgress` already committed.
        errorMessage: message,
        markBackfillComplete: false,
        lastReviewSyncedAt: null,
      });

      this.logger.error(`Review backfill failed for location ${job.locationId}: ${message}`);
      throw error;
    }
  }

  /**
   * Acquires its own `sync_runs` row at job start, not at enqueue time: a queued job can wait, and
   * claiming only when it truly starts is what lets a still-running previous poll block this one.
   * A `null` acquisition (another run active) is a successful no-op, not an error to retry or DLQ.
   * Re-reads the cursor rather than trusting a possibly stale job payload.
   *
   * Does not yet handle upstream-edited reviews or owner replies made directly on Google; both need
   * superseding `review_responses` rows.
   */
  async runPoll(job: IReviewSyncJob): Promise<void> {
    const run = await this.reviewSyncDbService.acquireSyncRun({
      tenantId: job.tenantId,
      locationId: job.locationId,
      trigger: SyncTrigger.SCHEDULED,
    });

    if (!run) {
      this.logger.debug(
        `Skipping poll for location ${job.locationId}: a sync run is already active for it.`
      );
      return;
    }

    this.logger.log(`Starting review poll for location ${job.locationId} (run ${run.id})`);

    let reviewsFetched = 0;
    let maxExternalUpdatedAt: string | null = null;

    try {
      const [accessToken, location] = await Promise.all([
        this.resolveAccessToken(job),
        this.connectionsDbService.findLocationForTenant(job.locationId, job.tenantId),
      ]);

      if (!location) {
        throw new Error(`Location ${job.locationId} not found for tenant ${job.tenantId}`);
      }

      // Before generating, so this tick's drafts already use the current phone and website.
      await this.refreshLocationDetailsIfStale(job, accessToken, location);

      const importResult = await this.importNewPages(
        job,
        run.id,
        accessToken,
        location.lastReviewSyncedAt
      );
      reviewsFetched = importResult.reviewsFetched;
      maxExternalUpdatedAt = importResult.maxExternalUpdatedAt;

      // After the import, so reviews that just arrived are already in place.
      await this.reconcileDeletedReviewsIfDue(job, accessToken, location.reviewsReconciledAt);

      const pipelineOutcome = await this.classifyAndGenerateForImportedReviews(job);

      // Truncation fails the run independently of pipelineOutcome: fetched reviews are committed
      // but the cursor must not move and the run must not read `ok`.
      const truncationError = importResult.truncated
        ? `hit the ${MAX_POLL_PAGES}-page cap before reaching the last-synced cursor: more than ${MAX_POLL_PAGES * GBP_REVIEWS_PAGE_SIZE} reviews are newer than it, which no real polling interval produces — the cursor was left unchanged (so nothing below the cap was skipped) and this location needs investigating rather than retrying`
        : null;
      const errorMessage = truncationError ?? pipelineOutcome.error;

      await this.reviewSyncDbService.completeRun({
        syncRunId: run.id,
        locationId: job.locationId,
        status: errorMessage === null ? SyncRunStatus.OK : SyncRunStatus.ERROR,
        reviewsFetched,
        errorMessage,
        // Only backfill sets this.
        markBackfillComplete: false,
        lastReviewSyncedAt: errorMessage === null ? maxExternalUpdatedAt : null,
      });

      if (errorMessage === null) {
        this.logger.log(
          `Review poll complete for location ${job.locationId}: ${reviewsFetched} reviews, ${pipelineOutcome.classified} classified (${pipelineOutcome.skipped} skipped), ${pipelineOutcome.generated} drafts generated (${pipelineOutcome.generationFailed} failed${pipelineOutcome.quotaReached ? ', AI-draft quota reached' : ''})`
        );
      } else {
        this.logger.error(
          `Review poll for location ${job.locationId} imported ${reviewsFetched} reviews but did not complete cleanly: ${errorMessage}`
        );
      }
    } catch (error) {
      const message = await this.handleSyncFailure(job, error);

      await this.reviewSyncDbService.completeRun({
        syncRunId: run.id,
        locationId: job.locationId,
        status: SyncRunStatus.ERROR,
        // Stale on a mid-import failure; see runBackfill's catch block.
        errorMessage: message,
        markBackfillComplete: false,
        lastReviewSyncedAt: null,
      });

      this.logger.error(`Review poll failed for location ${job.locationId}: ${message}`);
      throw error;
    }
  }

  /** A dead grant is recorded on the connection so the owner is told to reconnect, not left with a silently stale location. */
  private async handleSyncFailure(job: IReviewSyncJob, error: unknown): Promise<string> {
    if (error instanceof ProviderAuthError) {
      await this.connectionsDbService.markNeedsReauth(job.connectionId);
    }
    return (error as Error).message;
  }

  /**
   * Reports failure rather than throwing, so a classification error doesn't discard committed
   * imports; the caller records it and withholds the backfill-complete stamp / cursor advance.
   * Recovery: re-trigger a failed backfill; a failed poll is retried next tick since the cursor
   * wasn't advanced.
   */
  private async classifyAndGenerateForImportedReviews(
    job: IReviewSyncJob
  ): Promise<ClassifyAndGenerateOutcome> {
    let classification: ClassifyPendingReviewsResult;
    try {
      classification = await this.reviewClassificationService.classifyPendingReviews({
        tenantId: job.tenantId,
        locationId: job.locationId,
      });
    } catch (error) {
      return {
        classified: 0,
        skipped: 0,
        generated: 0,
        generationFailed: 0,
        quotaReached: false,
        error: `classification failed: ${(error as Error).message}`,
      };
    }

    // Generation errors are deliberately kept out of `error`, which gates `markBackfillComplete` and
    // the cursor advance to protect `pending_classification` rows; classification has already
    // committed, and generation self-heals (`findClassifiedNeedingGeneration` retries next tick).
    try {
      const generation = await this.aiReplyGenerationService.generateForClassifiedReviews({
        tenantId: job.tenantId,
        locationId: job.locationId,
      });

      return {
        ...classification,
        generated: generation.generated,
        generationFailed: generation.failed,
        quotaReached: generation.quotaReached,
        error: null,
      };
    } catch (error) {
      this.logger.error(
        `Generation phase failed for location ${job.locationId} (tenant ${job.tenantId}) — classification itself succeeded and is unaffected: ${
          (error as Error).message
        }`
      );
      return {
        ...classification,
        generated: 0,
        generationFailed: 0,
        quotaReached: false,
        error: null,
      };
    }
  }

  /**
   * The incremental poll never revisits old reviews, so a review its author deleted on Google would sit in the queue
   * forever. Once a day the location's whole review list is read and compared: open reviews (waiting on a reply) that
   * Google no longer lists become `removed`, and a `removed` one listed again is restored. Safe by construction: it
   * decides nothing unless the walk saw the complete list, never acts on an empty list (an outage or glitch looks the
   * same), and skips reviews imported in the last hour. Best-effort and stamped as an attempt even on failure, like
   * the details refresh, so Google is asked at most once a day.
   */
  private async reconcileDeletedReviewsIfDue(
    job: IReviewSyncJob,
    accessToken: string,
    reviewsReconciledAt: string | null
  ): Promise<void> {
    if (
      reviewsReconciledAt !== null &&
      Date.now() - new Date(reviewsReconciledAt).getTime() < REVIEW_RECONCILE_INTERVAL_MS
    ) {
      return;
    }

    try {
      const listed = await this.listAllExternalReviewIds(job, accessToken);
      if (listed === null) {
        this.logger.warn(
          `Skipping the deleted-review check for location ${job.locationId}: more than ${MAX_RECONCILE_PAGES} pages of reviews.`
        );
      } else {
        await this.applyReviewReconciliation(job, accessToken, listed);
      }
    } catch (error) {
      this.logger.warn(
        `Could not check location ${job.locationId} for deleted reviews (next try in a day): ${(error as Error).message}`
      );
    }

    try {
      await this.connectionsDbService.markReviewsReconciled(job.locationId);
    } catch (error) {
      this.logger.warn(
        `Could not record the deleted-review check for location ${job.locationId}: ${(error as Error).message}`
      );
    }
  }

  /** Any failure other than a 404 (rate limit, outage, auth) answers `false`: nothing is decided on a guess. */
  private async isDeletedOnProvider(
    job: IReviewSyncJob,
    accessToken: string,
    externalReviewId: string
  ): Promise<boolean> {
    try {
      await this.provider.getReviewReply(accessToken, {
        externalAccountId: job.externalAccountId,
        externalLocationId: job.externalLocationId,
        externalReviewId,
      });
      return false;
    } catch (error) {
      return error instanceof ProviderNotFoundError;
    }
  }

  /** `null` when the list is too long to read in full. */
  private async listAllExternalReviewIds(
    job: IReviewSyncJob,
    accessToken: string
  ): Promise<Set<string> | null> {
    const listed = new Set<string>();
    let pageToken: string | undefined;

    for (let pages = 0; pages < MAX_RECONCILE_PAGES; pages += 1) {
      const page = await this.listReviewsWithBackoff(accessToken, {
        externalAccountId: job.externalAccountId,
        externalLocationId: job.externalLocationId,
        pageToken,
      });
      for (const review of page.reviews) {
        listed.add(review.externalReviewId);
      }
      if (!page.nextPageToken) {
        return listed;
      }
      pageToken = page.nextPageToken;
    }
    return null;
  }

  private async applyReviewReconciliation(
    job: IReviewSyncJob,
    accessToken: string,
    listed: Set<string>
  ): Promise<void> {
    const open = await this.reviewSyncDbService.findOpenReviewsForReconciliation({
      locationId: job.locationId,
      createdBefore: new Date(Date.now() - RECONCILE_GRACE_MS).toISOString(),
    });

    if (listed.size === 0) {
      if (open.length > 0) {
        this.logger.warn(
          `Google lists no reviews for location ${job.locationId} but ${open.length} open review(s) are held; not treating them as deleted.`
        );
      }
      return;
    }

    const restored = await this.reviewSyncDbService.restoreRelistedReviews({
      locationId: job.locationId,
      externalReviewIds: [...listed],
    });
    // Paging gives no stable position (a review can slip between pages), so "not in the list" is only a lead: each
    // one is asked for directly, and only Google's own 404 counts as proof it is gone.
    const gone: string[] = [];
    for (const review of open.filter(candidate => !listed.has(candidate.externalReviewId))) {
      if (await this.isDeletedOnProvider(job, accessToken, review.externalReviewId)) {
        gone.push(review.id);
      }
    }
    const removed = await this.reviewSyncDbService.markReviewsRemovedUpstream(gone);

    if (restored > 0 || removed > 0) {
      this.logger.log(
        `Deleted-review check for location ${job.locationId}: ${removed} review(s) no longer on Google marked removed, ${restored} restored.`
      );
    }
  }

  /**
   * Best-effort: the details only feed the reply prompt and the dashboard, so a failure is logged rather than failing
   * the poll, and stamped as an attempt so it is retried in a day, not on every tick. A location never tried (or not
   * for a day) is due.
   */
  private async refreshLocationDetailsIfStale(
    job: IReviewSyncJob,
    accessToken: string,
    location: { name: string; detailsRefreshedAt: string | null }
  ): Promise<void> {
    const { detailsRefreshedAt } = location;
    if (
      detailsRefreshedAt !== null &&
      Date.now() - new Date(detailsRefreshedAt).getTime() < LOCATION_DETAILS_REFRESH_MS
    ) {
      return;
    }

    try {
      const details = await this.provider.getLocation(accessToken, job.externalLocationId);
      await this.connectionsDbService.updateLocationDetails({
        locationId: job.locationId,
        // The mapper falls back to the resource path when Google's title is blank (it often briefly is); never
        // replace a real name with that id.
        name: details.name === job.externalLocationId ? location.name : details.name,
        address: details.address,
        phone: details.phone,
        websiteUri: details.websiteUri,
      });
    } catch (error) {
      this.logger.warn(
        `Could not refresh details for location ${job.locationId} (next try in a day): ${(error as Error).message}`
      );
      try {
        await this.connectionsDbService.markLocationDetailsAttempted(job.locationId);
      } catch (stampError) {
        this.logger.warn(
          `Could not record the details refresh attempt for location ${job.locationId}: ${(stampError as Error).message}`
        );
      }
    }
  }

  private async resolveAccessToken(job: IReviewSyncJob): Promise<string> {
    const connection = await this.connectionsDbService.findConnectionByTenant(job.tenantId);

    if (!connection) {
      throw new ProviderAuthError(`No provider connection for tenant ${job.tenantId}`);
    }

    const { accessToken, refreshedExpiresAt } = await this.credentialService.resolveAccessToken({
      connectionId: connection.id,
      credentialReference: connection.credentialReference,
      tokenExpiresAt: connection.tokenExpiresAt,
    });

    if (refreshedExpiresAt) {
      await this.connectionsDbService.updateTokenExpiry(connection.id, refreshedExpiresAt);
    }

    return accessToken;
  }

  /**
   * Progress is written after every page: `updated_at` is the heartbeat the stale-run reclaim reads,
   * so a job writing only at the end would be reclaimed mid-run.
   */
  private async importAllPages(
    job: IReviewSyncJob,
    syncRunId: string,
    accessToken: string
  ): Promise<ImportOutcome> {
    let pageToken: string | undefined;
    let reviewsFetched = 0;
    let repliesImported = 0;
    let totalRecorded = false;
    let pagesRead = 0;
    let maxExternalUpdatedAt: string | null = null;

    do {
      const page = await this.listReviewsWithBackoff(accessToken, {
        externalAccountId: job.externalAccountId,
        externalLocationId: job.externalLocationId,
        pageToken,
      });

      const result = await this.reviewSyncDbService.importPage({
        tenantId: job.tenantId,
        locationId: job.locationId,
        reviews: page.reviews.map(review => ({
          externalReviewId: review.externalReviewId,
          externalReviewerId: review.externalReviewerId,
          reviewerName: review.reviewerName,
          rating: review.rating,
          text: review.text,
          reviewedAt: review.reviewedAt,
          externalUpdatedAt: review.externalUpdatedAt,
          reply: review.reply
            ? { comment: review.reply.comment, updatedAt: review.reply.updatedAt }
            : null,
        })),
      });

      reviewsFetched += result.reviewsWritten;
      repliesImported += result.repliesImported;
      pagesRead += 1;
      for (const review of page.reviews) {
        maxExternalUpdatedAt = this.newerTimestamp(maxExternalUpdatedAt, review.externalUpdatedAt);
      }

      await this.reviewSyncDbService.recordProgress(syncRunId, {
        reviewsFetched,
        // Google sends totalReviewCount only on the first response; rewriting it would move the denominator.
        ...(totalRecorded || page.totalCount === null ? {} : { reviewsTotal: page.totalCount }),
      });

      if (page.totalCount !== null) {
        totalRecorded = true;
      }

      pageToken = page.nextPageToken ?? undefined;
    } while (pageToken && repliesImported < IMPORTED_REPLY_TARGET && pagesRead < MAX_PAGES);

    if (pageToken) {
      // A deliberate stop, not an error; logged so "why only 300 of 2,000 reviews" is answerable.
      this.logger.log(
        `Stopped backfill for location ${job.locationId} after ${pagesRead} pages / ${repliesImported} imported replies; more history remains.`
      );
    }

    return { reviewsFetched, maxExternalUpdatedAt };
  }

  /**
   * Google orders `reviews.list` `updateTime desc` with no date filter, so this walks pages and stops
   * at the first review at or before `cursor`.
   *
   * A `null` cursor (never seeded) is bounded by the page cap alone and is not `truncated`: with no
   * watermark there is no gap to skip, and the newest timestamp becomes the watermark.
   *
   * Hitting the cap before the cursor is `truncated` and fails the run. The next cycle would not
   * catch the rest: the newest slice was imported, so advancing the cursor would skip the cut-off
   * reviews permanently, and holding it just re-walks the same slice. Draining would need a second,
   * low-water cursor, deliberately not built since truncation implies something pathological.
   */
  private async importNewPages(
    job: IReviewSyncJob,
    syncRunId: string,
    accessToken: string,
    cursor: string | null
  ): Promise<PollImportOutcome> {
    const cursorTime = cursor === null ? null : new Date(cursor).getTime();
    // Walks slightly past the cursor; see `POLL_CURSOR_OVERLAP_MS`.
    const stopBeforeTime = cursorTime === null ? null : cursorTime - POLL_CURSOR_OVERLAP_MS;

    let pageToken: string | undefined;
    let reviewsFetched = 0;
    let pagesRead = 0;
    let maxExternalUpdatedAt: string | null = null;
    let reachedCursor = false;

    do {
      const page = await this.listReviewsWithBackoff(accessToken, {
        externalAccountId: job.externalAccountId,
        externalLocationId: job.externalLocationId,
        pageToken,
      });

      const newReviews: typeof page.reviews = [];
      for (const review of page.reviews) {
        if (
          stopBeforeTime !== null &&
          new Date(review.externalUpdatedAt).getTime() <= stopBeforeTime
        ) {
          reachedCursor = true;
          break;
        }
        newReviews.push(review);
        maxExternalUpdatedAt = this.newerTimestamp(maxExternalUpdatedAt, review.externalUpdatedAt);
      }

      if (newReviews.length > 0) {
        const result = await this.reviewSyncDbService.importPollPage({
          tenantId: job.tenantId,
          locationId: job.locationId,
          reviews: newReviews.map(review => ({
            externalReviewId: review.externalReviewId,
            externalReviewerId: review.externalReviewerId,
            reviewerName: review.reviewerName,
            rating: review.rating,
            text: review.text,
            reviewedAt: review.reviewedAt,
            externalUpdatedAt: review.externalUpdatedAt,
            reply: review.reply
              ? { comment: review.reply.comment, updatedAt: review.reply.updatedAt }
              : null,
          })),
        });

        reviewsFetched += result.reviewsWritten;
      }

      pagesRead += 1;

      // No `reviewsTotal`: `page.totalCount` is Google's lifetime count, not what this poll fetches.
      await this.reviewSyncDbService.recordProgress(syncRunId, { reviewsFetched });

      pageToken = page.nextPageToken ?? undefined;
    } while (pageToken && !reachedCursor && pagesRead < MAX_POLL_PAGES);

    return {
      reviewsFetched,
      maxExternalUpdatedAt,
      // `cursor !== null` is load-bearing: with no prior watermark there is no gap to skip, and
      // without it a null-cursor location with more than MAX_POLL_PAGES pages would fail every poll.
      truncated: cursor !== null && Boolean(pageToken) && !reachedCursor,
    };
  }

  /** Numeric, not string, comparison: immune to ISO-8601 formatting or precision quirks. */
  private newerTimestamp(current: string | null, candidate: string): string {
    if (current === null) {
      return candidate;
    }
    return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
  }

  /**
   * A 429 means "slower", not "stop": the 300 QPM quota is shared by all tenants, so failing the run
   * would hand the owner a retry for something that resolves in seconds. Waits `Retry-After`, else a
   * default, capped so a bad header can't park the job until the stale-run reclaim takes it.
   */
  private async listReviewsWithBackoff(
    accessToken: string,
    options: Parameters<ReviewProvider['listReviews']>[1]
  ): Promise<Awaited<ReturnType<ReviewProvider['listReviews']>>> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.provider.listReviews(accessToken, options);
      } catch (error) {
        if (!(error instanceof ProviderRateLimitError) || attempt >= RATE_LIMIT_MAX_RETRIES) {
          throw error;
        }

        const waitSeconds = Math.min(
          error.retryAfterSeconds ?? RATE_LIMIT_DEFAULT_WAIT_SECONDS,
          RATE_LIMIT_MAX_WAIT_SECONDS
        );
        this.logger.warn(
          `Rate limited listing reviews for ${options.externalLocationId}; waiting ${waitSeconds}s (attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`
        );
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      }
    }
  }
}
