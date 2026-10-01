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
import { ProviderAuthError, ProviderRateLimitError } from '@review-provider/errors/provider.error';
import { ProviderCredentialService } from '@review-provider/provider-credential.service';
import { ReviewProvider } from '@review-provider/providers/review-provider.provider';

/**
 * PLAN.md §5 wants ~50 historical replies as few-shot examples for the AI's voice. Stopping there
 * rather than importing everything keeps a decade-old business's onboarding from taking an hour
 * for material nobody reads. Backfill-only — a poll has no reply target, it just fetches what's
 * new.
 */
const IMPORTED_REPLY_TARGET = 50;

/**
 * Backfill's hard stop, independent of the reply target above — a location can have thousands of
 * reviews and almost no owner replies, and without this the "50 replies" rule alone would
 * paginate an entire decade looking for a 50th that does not exist.
 */
const MAX_PAGES = 20;

/**
 * The poll's own cap, an order of magnitude above backfill's, because the two are guarding
 * different things. Backfill's 20 pages bound a *deliberate sample* of history (PLAN.md §7).
 * A poll is not sampling: it must cover everything newer than the location's cursor, or it leaves
 * a gap it can never come back for — reviews below a cursor are invisible to every later poll.
 *
 * So this exists purely as a runaway guard (a cursor corrupted to 1970 against a location with
 * 100k reviews), set high enough that no real business reaches it: 200 pages is 10,000 reviews
 * arriving between two 15-minute ticks. A steady-state poll needs one page. Hitting this is
 * therefore a genuine anomaly worth failing the run over, not routine truncation to be absorbed —
 * see `importNewPages`.
 */
const MAX_POLL_PAGES = 200;

/**
 * Subtracted from the cursor before `importNewPages`'s own stop check — a defense against page-
 * boundary instability, not a change to the cursor itself. Google's `reviews.list` walks a live,
 * mutating list ordered by `updateTime desc` with no documented guarantee that a review's
 * position is stable across the handful of page fetches one poll makes. A review created, or an
 * existing one edited (bumping its `updateTime`), while this poll is mid-walk can shift later
 * pages' boundaries just enough that a review sitting right at the old cursor lands on the wrong
 * side of this run's cutoff and is silently skipped — permanently, since no later poll ever
 * revisits below its own cursor (see `importNewPages`'s doc comment on truncation for why that is
 * true of this single high-water-cursor design generally).
 *
 * Re-examining a small window before the cursor closes this without a low-water/seen-id
 * bookkeeping change to that design: `upsertReview`'s `ON CONFLICT` never touches `status` or
 * `classification`, and `insertImportedReply` silently no-ops on a reply already imported, so
 * re-walking already-seen reviews here is a harmless, idempotent no-op in the ordinary case — and
 * catches the boundary-shift case on this or the next poll instead of depending on this run's
 * page boundaries having landed exactly where they would have without the race. Five minutes
 * against a 15-minute poll interval adds at most a few already-seen reviews to recheck, never
 * another page fetch by itself.
 */
const POLL_CURSOR_OVERLAP_MS = 5 * 60 * 1000;

/**
 * Both review ingestion paths: the one-time historical backfill (`runBackfill`) and the 15-minute
 * scheduled poll (`runPoll`). Transport-agnostic — the processor and the SQS consumer both call
 * into here and neither contains logic. The two entrypoints share every helper below them;
 * `resolveBackfillStatus`'s three-way status split is the one piece of business logic that stays
 * backfill-only, inside `ReviewSyncDbService.importPage`.
 */
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
   * `isRetry` is BullMQ's `job.attemptsMade > 0` — whether this is the second (of `attempts: 2`)
   * pass at the *same* job. It matters because `job.syncRunId` is acquired once, before the job is
   * ever published, so a retry is not a new run: it is the same `sync_runs` row, replaying.
   *
   * The first attempt's catch block already moved that row to `error` via `completeRun`, whose own
   * CAS only matches `status = 'running'`. Without reopening it here, a *successful* second
   * attempt's own `completeRun` call would find zero rows to update — `markBackfillComplete` and
   * the cursor advance would silently never run, permanently excluding the location from polling,
   * while BullMQ still reports the job completed. See `reopenSyncRunForRetry`.
   */
  async runBackfill(job: IReviewBackfillJob, isRetry = false): Promise<void> {
    this.logger.log(
      `Starting review backfill for location ${job.locationId} (run ${job.syncRunId})${isRetry ? ' [retry]' : ''}`
    );

    if (isRetry) {
      const reopened = await this.reviewSyncDbService.reopenRunForRetry(job.syncRunId);
      if (!reopened) {
        // Not "reclaimed as stale" — nothing else acquires a backfill run by this id. Most likely
        // the row is gone entirely (a dev DB reset). Failing loudly here is deliberate: silently
        // continuing would import reviews under a run id whose completion can never be recorded.
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
        // Only a run that finished *both* halves un-gates live polling (PLAN.md §8.2). The job
        // sets it, not the HTTP handler, because until the import finishes there is nothing to
        // poll on top of — and a run whose pipelineOutcome step failed left
        // `pending_pipelineOutcome` rows behind, so stamping completion would report
        // `livePollingEnabled: true` (see ConnectionsSyncService, which calls that "the only
        // correct signal for advancing the UI to 'done'") for a pipeline that is not done.
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
        // Not `reviewsFetched`: that local variable only updates when `importAllPages` returns,
        // so on a failure partway through paginating it is still its starting value — writing it
        // here would overwrite the real, larger count `recordSyncProgress` already committed for
        // whichever pages did succeed before the throw. See `completeSyncRun`.
        errorMessage: message,
        markBackfillComplete: false,
        lastReviewSyncedAt: null,
      });

      this.logger.error(`Review backfill failed for location ${job.locationId}: ${message}`);
      throw error;
    }
  }

  /**
   * The 15-minute scheduled poll. Acquires its own `sync_runs` row here rather than receiving one
   * pre-acquired in the job payload the way `runBackfill` does — `CronService.pollDueLocations`
   * only enumerates and fans out (per this codebase's own rule that a `@Cron` method enqueues, it
   * does not work), so nothing has claimed a run for this location yet when the job is published.
   * Acquiring it now, not at enqueue time, is also what makes PLAN.md §8.1's overlapping-poll
   * guard actually apply: a BullMQ job can sit queued for a while, and claiming the row only when
   * the job truly starts is what lets a still-running previous poll block this one.
   *
   * A `null` acquisition (another run for this location is already genuinely active) is logged and
   * treated as a normal, successful no-op — not a thrown error, since a job retry or a DLQ entry
   * would be the wrong response to "someone else already has this."
   *
   * Also re-reads the location's `last_review_synced_at` cursor itself right before paginating,
   * rather than trusting a value baked into the job payload, for the same staleness reason.
   *
   * Out of scope, same as `runBackfill`: PLAN.md §8.6 (a review edited upstream) and §8.12 (an
   * owner replying directly on Google) both require superseding `review_responses` rows, which
   * belongs to generation — not built yet. This only ingests and classifies, same as backfill does
   * for its own `new` rows.
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

      const importResult = await this.importNewPages(
        job,
        run.id,
        accessToken,
        location.lastReviewSyncedAt
      );
      reviewsFetched = importResult.reviewsFetched;
      maxExternalUpdatedAt = importResult.maxExternalUpdatedAt;

      const pipelineOutcome = await this.classifyAndGenerateForImportedReviews(job);

      // Truncation is its own failure, independent of pipelineOutcome: the reviews that *were*
      // fetched are committed and classified, but the cursor must not move (see `importNewPages`)
      // and the run must not read `ok`, or a backlog this poll silently could not drain would look
      // like a healthy sync in `last_sync_status`.
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
        // A poll never sets this — it stays backfill's own signal (PLAN.md §8.2).
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
        // See the matching comment in runBackfill's catch block: this local variable is stale on
        // a mid-import failure, and would overwrite recordSyncProgress's real, larger count.
        errorMessage: message,
        markBackfillComplete: false,
        lastReviewSyncedAt: null,
      });

      this.logger.error(`Review poll failed for location ${job.locationId}: ${message}`);
      throw error;
    }
  }

  /**
   * PLAN.md §8.14: a dead grant is recorded on the connection, not just reported. Without this the
   * owner sees a failed backfill or a location stuck "last synced: 3 days ago" with no indication
   * that reconnecting is the fix. Shared by both entrypoints — §8.14 describes this as a mid-run
   * failure, which is arguably more a polling concern (a token that was fine at backfill time can
   * expire or be revoked at any later poll) than a backfill one.
   */
  private async handleSyncFailure(job: IReviewSyncJob, error: unknown): Promise<string> {
    if (error instanceof ProviderAuthError) {
      await this.connectionsDbService.markNeedsReauth(job.connectionId);
    }
    return (error as Error).message;
  }

  /**
   * Reports the failure rather than throwing, so a classification error does not discard an import
   * whose rows are already committed — but the caller still records it on the run and withholds
   * the backfill-complete stamp / cursor advance. Swallowing it outright was wrong in a way worth
   * naming: it left `sync_runs` reading `ok` with `reviews_fetched` set while
   * `pending_classification` rows sat behind an onboarding UI that had already advanced to "you're
   * all set".
   *
   * Recovery for a failed backfill is re-triggering it (`POST` confirm-location accepts the same
   * location and acquires a fresh run); recovery for a failed poll is simply the next 15-minute
   * tick, since the cursor was never advanced past what this run actually classified.
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

    // Generation is a peer step in this same job/tick, not a separate cron — see
    // `AiReplyGenerationService`'s own module doc for why. Query-driven, like classification's own
    // read: it picks up this run's freshly-classified reviews *and* any backlog a prior tick's
    // generation phase failed to clear, with no list threaded through from the call above.
    //
    // A generation-phase failure — even a top-level one, not just one per-item failure among
    // many — is deliberately kept out of the `error` field below, unlike a classification
    // failure. `error` is what gates `markBackfillComplete`/the cursor advance in both callers,
    // and that gate exists to protect `pending_classification` rows that a failed classification
    // pass left behind (see this method's own opening doc comment) — a risk that has already
    // passed by the time generation even starts, since classification committed above. Generation
    // is also query-driven and self-healing (`findClassifiedNeedingGeneration` picks up anything
    // this tick missed on the very next one), which a classification failure is not — there is no
    // equivalent "just try again in 15 minutes" recovery for reviews still sitting unclassified.
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
   * Paginates until the reply target is met, history runs out, or the page cap is hit.
   *
   * Progress is written after **every** page rather than once at the end, for two reasons: it is
   * what makes the owner's progress bar move on real data, and `updated_at` is the heartbeat the
   * stale-run reclaim predicate reads — a job that only wrote at the end would look stalled for
   * its entire duration and be reclaimed out from under itself.
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
        // Written once, from the first page that reports one — Google only sends
        // totalReviewCount on the initial response, and re-writing it every page would be a
        // no-op at best and a moving denominator at worst.
        ...(totalRecorded || page.totalCount === null ? {} : { reviewsTotal: page.totalCount }),
      });

      if (page.totalCount !== null) {
        totalRecorded = true;
      }

      pageToken = page.nextPageToken ?? undefined;
    } while (pageToken && repliesImported < IMPORTED_REPLY_TARGET && pagesRead < MAX_PAGES);

    if (pageToken) {
      // Not an error — a deliberate stop. Logged so a support question about "why does this tenant
      // only have 300 of its 2,000 reviews" has an answer that isn't log spelunking.
      this.logger.log(
        `Stopped backfill for location ${job.locationId} after ${pagesRead} pages / ${repliesImported} imported replies; more history remains.`
      );
    }

    return { reviewsFetched, maxExternalUpdatedAt };
  }

  /**
   * The poll counterpart to `importAllPages`. Google orders `reviews.list` `updateTime desc`
   * (`GBP_REVIEWS_ORDER_BY`) and offers no server-side date filter, so this is the only way to
   * fetch incrementally: walk pages, and the moment a review is seen at or before `cursor`,
   * everything from that point in this page — and every later page — is already known, so
   * pagination stops right there rather than re-fetching a location's entire history every cycle.
   *
   * `cursor === null` — a location whose `last_review_synced_at` was never seeded (a successful
   * backfill that fetched zero reviews, or one predating that column) — is bounded by the page cap
   * alone, and is **not** reported as truncated: with no prior watermark there is no gap to skip,
   * so taking the newest page-cap's worth and adopting the newest timestamp as the watermark is
   * the correct "start from here". See the `truncated` computation for why conflating the two
   * cases made every poll of such a location fail forever.
   *
   * **Hitting the page cap before reaching the cursor is reported as `truncated`, and the caller
   * treats it as a failed run.** It cannot be shrugged off as "the next cycle will catch the rest",
   * because it will not: Google orders `updateTime desc`, so a capped run has imported the
   * *newest* slice of the backlog and `maxExternalUpdatedAt` is the global newest. Advancing the
   * cursor there would step straight over everything the cap cut off — permanently, since no later
   * poll ever looks below its own cursor. Leaving the cursor alone doesn't drain it either: with
   * this single high-water cursor the next run re-walks the identical newest slice and truncates at
   * the identical point. So the only outcome consistent with the state we keep is to import what
   * was fetched, hold the cursor, and surface the run as an error for a human to look at.
   *
   * Draining such a backlog *is* possible, but not with the state this design keeps: it would take
   * a second, low-water cursor (page forward from the oldest un-imported review across successive
   * runs, rather than backwards from the newest). That is deliberately not built — with
   * `MAX_POLL_PAGES` sized as it is, truncation means something pathological (a corrupted cursor,
   * a location with a five-figure review burst inside 15 minutes), and the right response to those
   * is a person looking at the run, not silent multi-cycle recovery machinery that would otherwise
   * never execute. If truncation is ever observed in practice, the low-water cursor is the fix.
   */
  private async importNewPages(
    job: IReviewSyncJob,
    syncRunId: string,
    accessToken: string,
    cursor: string | null
  ): Promise<PollImportOutcome> {
    const cursorTime = cursor === null ? null : new Date(cursor).getTime();
    // See `POLL_CURSOR_OVERLAP_MS` — the stop check walks slightly past the exact cursor so a
    // review whose page-boundary position shifted mid-walk is re-examined rather than skipped.
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

      // No `reviewsTotal` here, unlike backfill's paginator: `page.totalCount` is Google's
      // *lifetime* review count for the location, and a poll is only ever fetching what is newer
      // than its cursor — a handful of reviews, typically. Writing the lifetime count as this
      // run's denominator turned every poll's `sync_runs` row into a meaningless "3 fetched / 2000
      // total". Nothing reads `reviewsTotal` off a poll run today (the frontend's progress bar
      // only ever queries `trigger = 'backfill'` runs), but a run that lies about what it was
      // trying to do is worth not writing regardless of who happens to read it.
      await this.reviewSyncDbService.recordProgress(syncRunId, { reviewsFetched });

      pageToken = page.nextPageToken ?? undefined;
    } while (pageToken && !reachedCursor && pagesRead < MAX_POLL_PAGES);

    return {
      reviewsFetched,
      maxExternalUpdatedAt,
      // `cursor !== null` is load-bearing, not defensive. Truncation only *skips* something when
      // there was a prior watermark to leave a gap below; with no cursor there is no gap — this is
      // the poller's first sight of the location, and importing the newest page-cap's worth and
      // adopting the newest timestamp as the watermark is exactly the right "start from here"
      // behaviour. Anything older than that is backfill's territory, not the poller's. Without
      // this clause, a location whose backfill completed without seeding a cursor (a successful
      // backfill that fetched zero reviews, or one that predates
      // `locations.last_review_synced_at` existing) but which has more than
      // MAX_POLL_PAGES × GBP_REVIEWS_PAGE_SIZE reviews would fail *every* poll forever: cursor
      // stays null, so the next run truncates identically, so the cursor stays null.
      truncated: cursor !== null && Boolean(pageToken) && !reachedCursor,
    };
  }

  /**
   * Compares numerically rather than as raw strings — both values are ISO-8601 from
   * `externalUpdatedAt`, which in practice is always Google's UTC `Z`-suffixed `updateTime`, but a
   * numeric comparison can never be inverted by a formatting or precision quirk a raw string
   * comparison would be exposed to.
   */
  private newerTimestamp(current: string | null, candidate: string): string {
    if (current === null) {
      return candidate;
    }
    return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
  }

  /**
   * A 429 is Google saying "slower", not "stop". The project-wide 300 QPM quota is shared by
   * every tenant, so a burst elsewhere can rate-limit this import through no fault of its own —
   * and failing the whole run for it would hand the owner a retry button for a problem that
   * resolves itself in seconds.
   *
   * Waits `Retry-After` when Google sends one, else a default, capped so a pathological header
   * can never park the job long enough for the stale-run reclaim to take it away mid-flight.
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
