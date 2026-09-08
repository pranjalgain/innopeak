import { IReviewBackfillJob } from '@bg/interfaces/job.interface';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import { Injectable, Logger } from '@nestjs/common';
import { ReviewClassificationService } from '@review-pipeline/review-classification.service';
import {
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
 * for material nobody reads.
 */
const IMPORTED_REPLY_TARGET = 50;

/**
 * A hard stop independent of the reply target, because a location can have thousands of reviews
 * and almost no owner replies — without this the "50 replies" rule alone would paginate the entire
 * history looking for a 50th that does not exist.
 */
const MAX_PAGES = 20;

/**
 * The one-time historical import. Transport-agnostic (BullMQ locally, SQS on AWS) — the processor
 * and the SQS consumer both call `runBackfill` and neither contains logic.
 */
@Injectable()
export class ReviewSyncQueueService {
  private readonly logger = new Logger(ReviewSyncQueueService.name);

  constructor(
    private readonly provider: ReviewProvider,
    private readonly credentialService: ProviderCredentialService,
    private readonly connectionsDbService: ConnectionsDbService,
    private readonly reviewSyncDbService: ReviewSyncDbService,
    private readonly reviewClassificationService: ReviewClassificationService
  ) {}

  async runBackfill(job: IReviewBackfillJob): Promise<void> {
    this.logger.log(
      `Starting review backfill for location ${job.locationId} (run ${job.syncRunId})`
    );

    let reviewsFetched = 0;

    try {
      const accessToken = await this.resolveAccessToken(job);
      reviewsFetched = await this.importAllPages(job, accessToken);

      const classification = await this.classifyImportedReviews(job);

      await this.reviewSyncDbService.completeRun({
        syncRunId: job.syncRunId,
        locationId: job.locationId,
        status: classification.error === null ? SyncRunStatus.OK : SyncRunStatus.ERROR,
        reviewsFetched,
        errorMessage: classification.error,
        // Only a run that finished *both* halves un-gates live polling (PLAN.md §8.2). The job
        // sets it, not the HTTP handler, because until the import finishes there is nothing to
        // poll on top of — and a run whose classification step failed left
        // `pending_classification` rows behind, so stamping completion would report
        // `livePollingEnabled: true` (see ConnectionsSyncService, which calls that "the only
        // correct signal for advancing the UI to 'done'") for a pipeline that is not done.
        markBackfillComplete: classification.error === null,
      });

      if (classification.error === null) {
        this.logger.log(
          `Review backfill complete for location ${job.locationId}: ${reviewsFetched} reviews, ${classification.classified} classified (${classification.skipped} skipped)`
        );
      } else {
        this.logger.error(
          `Review backfill for location ${job.locationId} imported ${reviewsFetched} reviews but classification failed; live polling stays gated: ${classification.error}`
        );
      }
    } catch (error) {
      const message = (error as Error).message;

      // A dead grant is recorded on the connection, not just reported — PLAN.md §8.14. Without
      // this the owner sees a failed import with no indication that reconnecting is the fix.
      if (error instanceof ProviderAuthError) {
        await this.connectionsDbService.markNeedsReauth(job.connectionId);
      }

      await this.reviewSyncDbService.completeRun({
        syncRunId: job.syncRunId,
        locationId: job.locationId,
        status: SyncRunStatus.ERROR,
        reviewsFetched,
        errorMessage: message,
        markBackfillComplete: false,
      });

      this.logger.error(`Review backfill failed for location ${job.locationId}: ${message}`);
      throw error;
    }
  }

  /**
   * Reports the failure rather than throwing, so a classification error does not discard an import
   * whose rows are already committed — but the caller still records it on the run and withholds
   * the backfill-complete stamp. Swallowing it outright was wrong in a way worth naming: it left
   * `sync_runs` reading `ok` with `reviews_fetched` set while `pending_classification` rows sat
   * behind an onboarding UI that had already advanced to "you're all set".
   *
   * Recovery is re-triggering backfill for the location (`POST` confirm-location accepts the same
   * location and acquires a fresh run); there is no automatic retry while the poller doesn't exist.
   */
  private async classifyImportedReviews(
    job: IReviewBackfillJob
  ): Promise<{ classified: number; skipped: number; error: string | null }> {
    try {
      const result = await this.reviewClassificationService.classifyPendingReviews({
        tenantId: job.tenantId,
        locationId: job.locationId,
      });

      return { ...result, error: null };
    } catch (error) {
      return {
        classified: 0,
        skipped: 0,
        error: `classification failed: ${(error as Error).message}`,
      };
    }
  }

  private async resolveAccessToken(job: IReviewBackfillJob): Promise<string> {
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
  private async importAllPages(job: IReviewBackfillJob, accessToken: string): Promise<number> {
    let pageToken: string | undefined;
    let reviewsFetched = 0;
    let repliesImported = 0;
    let totalRecorded = false;
    let pagesRead = 0;

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

      await this.reviewSyncDbService.recordProgress(job.syncRunId, {
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

    return reviewsFetched;
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
