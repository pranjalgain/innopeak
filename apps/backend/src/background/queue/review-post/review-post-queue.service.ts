import { IReviewPostJob } from '@bg/interfaces/job.interface';
import { MESSAGES } from '@common/constants/messages.constants';
import { POST_CLAIM_STALE_MINUTES } from '@common/constants/review-post.constants';
import { ResponseStatus } from '@common/enums/response-status.enum';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import type { ReviewRow } from '@db/repositories/review-sync/types/review-sync.type';
import { Injectable, Logger } from '@nestjs/common';
import {
  CredentialReferenceUnresolvableError,
  ProviderAuthError,
  ProviderMappingError,
  ProviderNotFoundError,
  ProviderRateLimitError,
  ProviderUnavailableError,
} from '@review-provider/errors/provider.error';
import { ProviderCredentialService } from '@review-provider/provider-credential.service';
import { ReviewProvider } from '@review-provider/providers/review-provider.provider';
import type { GetReviewReplyInput } from '@review-provider/types/review-provider.type';

import { LocationUnavailableError, ReviewRemovedUpstreamError } from './review-post.errors';
import { ReviewPostQueue } from './review-post.queue';
import { normalizeReplyText } from './review-post.util';

import { InAppNotificationsService } from '../../../api/notifications/services/in-app-notifications.service';

/**
 * Total tries, first attempt included, for a transient provider failure or a post-success DB
 * failure.
 */
const MAX_POST_ATTEMPTS = 3;

/** Wait before the 2nd and 3rd attempt after a transient provider error (429 / 5xx / network). */
const TRANSIENT_RETRY_DELAYS_MS = [60_000, 5 * 60_000];

/** Wait before re-checking a response whose Google call succeeded but whose DB write failed. Must
 *  outlast the claim's staleness window, or the re-check could not claim the still-held row. */
const RECORD_RECHECK_DELAY_MS = (POST_CLAIM_STALE_MINUTES + 1) * 60_000;

type PostOutcome =
  | { kind: 'external'; content: string; postedAt: string }
  | { kind: 'posted'; content: string; postedAt: string };

/**
 * Transport-agnostic: the BullMQ processor and the SQS consumer both just call `postResponse`.
 * Retries are this class's own: the queue runs `attempts: 1` because a blind transport retry would
 * replay a stale decision instead of re-running the freshness check. A transient failure (rate
 * limit, 5xx, network) releases the claim and re-enqueues with `attempt + 1` and a delay; anything
 * else is terminal for the attempt, left to the user's `retry-post`.
 */
@Injectable()
export class ReviewPostQueueService {
  private readonly logger = new Logger(ReviewPostQueueService.name);

  constructor(
    private readonly provider: ReviewProvider,
    private readonly credentialService: ProviderCredentialService,
    private readonly connectionsDbService: ConnectionsDbService,
    private readonly reviewSyncDbService: ReviewSyncDbService,
    private readonly reviewPostQueue: ReviewPostQueue,
    private readonly inAppNotificationsService: InAppNotificationsService
  ) {}

  async postResponse(job: IReviewPostJob): Promise<void> {
    const attempt = job.attempt ?? 1;

    const claimed = await this.reviewSyncDbService.claimResponseForPosting({
      responseId: job.responseId,
      tenantId: job.tenantId,
    });

    if (!claimed) {
      await this.recheckIfStillApproved(job, attempt);
      return;
    }

    const review = await this.reviewSyncDbService.findReviewForTenant({
      reviewId: job.reviewId,
      tenantId: job.tenantId,
    });

    if (!review) {
      // Should not happen (FK), but fail loudly rather than leave the claim stuck at `approved`
      // with a `post_attempted_at` nothing will clear.
      const message = `Review ${job.reviewId} not found while posting response ${job.responseId}`;
      await this.markFailedSafely(job.responseId, MESSAGES.REVIEWS.POST_FAILED_UNKNOWN);
      throw new Error(message);
    }

    if (review.removedUpstreamAt !== null) {
      // No reply target: fail up front with a clear reason instead of a Google 404.
      await this.markFailedSafely(job.responseId, MESSAGES.REVIEWS.POST_FAILED_REVIEW_REMOVED);
      this.logger.warn(
        `Not posting response ${job.responseId}: review ${job.reviewId} was removed on Google.`
      );
      return;
    }

    let outcome: PostOutcome;
    try {
      outcome = await this.postOrResolve(job, review, claimed.content);
    } catch (error) {
      await this.handleProviderFailure(job, attempt, error);
      return;
    }

    try {
      await this.recordOutcome(job, outcome);
    } catch (error) {
      await this.handleRecordFailure(job, attempt, error);
    }
  }

  /**
   * Kept apart from the local writes so a database failure is never mistaken for a failed post (the
   * reply may already be live).
   */
  private async postOrResolve(
    job: IReviewPostJob,
    review: ReviewRow,
    content: string
  ): Promise<PostOutcome> {
    const connection = await this.connectionsDbService.findConnectionByTenant(job.tenantId);
    if (!connection) {
      throw new ProviderAuthError(`No provider connection for tenant ${job.tenantId}`);
    }

    const location = await this.connectionsDbService.findLocationForTenant(
      review.locationId,
      job.tenantId
    );
    if (!location) {
      throw new Error(`Location ${review.locationId} not found for tenant ${job.tenantId}`);
    }

    const { accessToken, refreshedExpiresAt } = await this.credentialService.resolveAccessToken({
      connectionId: connection.id,
      credentialReference: connection.credentialReference,
      tokenExpiresAt: connection.tokenExpiresAt,
    });

    if (refreshedExpiresAt) {
      await this.connectionsDbService.updateTokenExpiry(connection.id, refreshedExpiresAt);
    }

    const providerInput = {
      externalAccountId: connection.providerAccountId,
      externalLocationId: location.externalLocationId,
      externalReviewId: review.externalReviewId,
    };

    try {
      return await this.resolveAgainstGoogle(job, accessToken, providerInput, content);
    } catch (error) {
      if (error instanceof ProviderNotFoundError) {
        throw await this.explainNotFound(accessToken, providerInput, error);
      }
      throw error;
    }
  }

  private async resolveAgainstGoogle(
    job: IReviewPostJob,
    accessToken: string,
    providerInput: GetReviewReplyInput,
    content: string
  ): Promise<PostOutcome> {
    // Fetched fresh immediately before posting, never from our last-polled copy of the review.
    const existingReply = await this.provider.getReviewReply(accessToken, providerInput);

    if (existingReply !== null) {
      if (normalizeReplyText(existingReply.comment) === normalizeReplyText(content)) {
        // Our own reply from a prior attempt that crashed between the Google PUT and
        // `markResponsePosted` committing. Recorded as posted rather than re-sent, which would be a
        // pointless second write.
        this.logger.log(
          `Response ${job.responseId} was already live on Google from a prior attempt; recording it as posted without re-sending.`
        );
        return { kind: 'posted', content, postedAt: existingReply.updatedAt };
      }

      // Someone replied another way (directly on Google, or a race with another worker): abort
      // rather than overwrite it.
      return {
        kind: 'external',
        content: existingReply.comment,
        postedAt: existingReply.updatedAt,
      };
    }

    const posted = await this.provider.replyToReview(accessToken, {
      ...providerInput,
      comment: content,
    });
    return { kind: 'posted', content, postedAt: posted.updatedAt };
  }

  /**
   * Google answers 404 both for a deleted review and for a location this account can no longer reach (moved to
   * another account, or gone), so the location's reviews are listed through the very same account/location path to
   * tell them apart: only if that path still answers is the 404 the review's own. A location-only lookup would not
   * do: it ignores the account, so a location moved to another account would still look reachable. A transient or
   * auth failure on that read is returned as is, so the usual retry and reconnect handling applies.
   */
  private async explainNotFound(
    accessToken: string,
    review: GetReviewReplyInput,
    notFound: ProviderNotFoundError
  ): Promise<Error> {
    const path = `${review.externalAccountId}/${review.externalLocationId}`;
    try {
      await this.provider.listReviews(accessToken, {
        externalAccountId: review.externalAccountId,
        externalLocationId: review.externalLocationId,
        pageSize: 1,
      });
    } catch (locationError) {
      if (
        locationError instanceof ProviderRateLimitError ||
        locationError instanceof ProviderUnavailableError ||
        locationError instanceof ProviderAuthError
      ) {
        return locationError;
      }
      // Only a 404 says the path is gone. Anything else means Google answered, e.g. a listed review our mapper
      // rejects (unknown starRating): the location is reachable, so the review's own 404 stands.
      if (!(locationError instanceof ProviderNotFoundError)) {
        return new ReviewRemovedUpstreamError(notFound.message);
      }
      return new LocationUnavailableError(
        `Google can't list reviews for ${path} either: ${this.messageOf(locationError)}`
      );
    }
    return new ReviewRemovedUpstreamError(notFound.message);
  }

  /**
   * A lost compare-and-swap (the response stopped being `approved`, e.g. a human rejected or edited
   * it mid-call) is not success: the reply is or was live on Google, so what Google has is
   * imported.
   */
  private async recordOutcome(job: IReviewPostJob, outcome: PostOutcome): Promise<void> {
    if (outcome.kind === 'posted') {
      const posted = await this.reviewSyncDbService.markResponsePosted({
        responseId: job.responseId,
        reviewId: job.reviewId,
        postedAt: outcome.postedAt,
      });

      if (posted) {
        this.logger.log(`Posted response ${job.responseId} for review ${job.reviewId} to Google.`);
        return;
      }

      await this.reviewSyncDbService.importLiveReply({
        tenantId: job.tenantId,
        reviewId: job.reviewId,
        content: outcome.content,
        postedAt: outcome.postedAt,
      });
      this.logger.warn(
        `Response ${job.responseId} was no longer approved when its post completed, but the reply is live on Google for review ${job.reviewId}; recorded the live reply as imported.`
      );
      return;
    }

    const superseded = await this.reviewSyncDbService.supersedeForExternalReply({
      responseId: job.responseId,
      reviewId: job.reviewId,
      tenantId: job.tenantId,
      content: outcome.content,
      postedAt: outcome.postedAt,
    });

    if (superseded) {
      this.logger.warn(
        `Aborted posting response ${job.responseId}: review ${job.reviewId} already has a different live reply on Google. Superseded the approval and imported the external reply instead.`
      );
      return;
    }

    await this.reviewSyncDbService.importLiveReply({
      tenantId: job.tenantId,
      reviewId: job.reviewId,
      content: outcome.content,
      postedAt: outcome.postedAt,
    });
    this.logger.warn(
      `Response ${job.responseId} was no longer approved, and review ${job.reviewId} has a different live reply on Google; recorded that reply as imported.`
    );
  }

  /**
   * Transient failures are rescheduled up to `MAX_POST_ATTEMPTS`; the rest, and an exhausted
   * transient, mark `post_failed` and rethrow so the queue's failed-job handling still sees them.
   */
  private async handleProviderFailure(
    job: IReviewPostJob,
    attempt: number,
    error: unknown
  ): Promise<void> {
    if (error instanceof ReviewRemovedUpstreamError) {
      await this.handleReviewRemovedUpstream(job);
      return;
    }

    if (error instanceof LocationUnavailableError) {
      // Not retried: the location has to be restored in Google first; the owner retries from the review page.
      await this.markFailedSafely(
        job.responseId,
        MESSAGES.REVIEWS.POST_FAILED_LOCATION_UNAVAILABLE
      );
      this.logger.warn(`Not posting response ${job.responseId}: ${error.message}`);
      return;
    }

    if (error instanceof ProviderAuthError) {
      // Record a dead grant on the connection, not just report it (as
      // `ReviewSyncQueueService.handleSyncFailure` does for reads).
      try {
        const connection = await this.connectionsDbService.findConnectionByTenant(job.tenantId);
        if (connection && (await this.connectionsDbService.markNeedsReauth(connection.id))) {
          await this.inAppNotificationsService.notifyConnectionIssue(job.tenantId);
        }
      } catch (reauthError) {
        this.logger.error(
          `Could not record needs_reauth after a provider auth failure: ${this.messageOf(reauthError)}`
        );
      }
    }

    const transient =
      error instanceof ProviderRateLimitError || error instanceof ProviderUnavailableError;
    if (transient && attempt < MAX_POST_ATTEMPTS) {
      const delayMs = this.transientDelayMs(attempt, error);
      if (await this.reschedule(job, attempt, delayMs, { releaseClaim: true })) {
        this.logger.warn(
          `Transient failure posting response ${job.responseId} (attempt ${attempt}/${MAX_POST_ATTEMPTS}): ${this.messageOf(error)}. Retrying in ${Math.round(delayMs / 1000)}s.`
        );
        return;
      }
    }

    // Our own wording, never the provider's raw text (it can be a JSON body): that is for the log.
    await this.markFailedSafely(job.responseId, this.reasonFor(error));
    this.logger.error(
      `Failed to post response ${job.responseId} for review ${job.reviewId}: ${this.messageOf(error)}`
    );
    throw error;
  }

  /**
   * Not marked `post_failed`: the reply may already be live and the database may be what is down.
   * The claim stays; a re-check job after it goes stale finds the reply and records it. Once
   * attempts are exhausted it gives up loudly, leaving the row `approved` for a manual post or
   * retry.
   */
  private async handleRecordFailure(
    job: IReviewPostJob,
    attempt: number,
    error: unknown
  ): Promise<void> {
    this.logger.error(
      `Google was reached for response ${job.responseId} (review ${job.reviewId}) but recording the result failed: ${this.messageOf(error)}`
    );

    if (
      attempt < MAX_POST_ATTEMPTS &&
      (await this.reschedule(job, attempt, RECORD_RECHECK_DELAY_MS, { releaseClaim: false }))
    ) {
      this.logger.warn(
        `Scheduled a re-check of response ${job.responseId} in ${Math.round(RECORD_RECHECK_DELAY_MS / 1000)}s to record whatever is live on Google.`
      );
      return;
    }

    throw error;
  }

  /**
   * A refused claim has two causes: the response moved on (posted, failed, superseded), where there is nothing left to do, or a
   * fresh claim is held by an attempt that may have died with its worker. BullMQ then re-delivers the job after the stall, finds
   * the claim still inside its staleness window and, if it just returned, would complete without ever posting, leaving the
   * reply `approved` with no job behind it. While it is still `approved`, look again once the claim has gone stale.
   */
  private async recheckIfStillApproved(job: IReviewPostJob, attempt: number): Promise<void> {
    try {
      const response = await this.reviewSyncDbService.findResponseForTenant({
        responseId: job.responseId,
        reviewId: job.reviewId,
        tenantId: job.tenantId,
      });

      if (response?.status !== ResponseStatus.APPROVED || attempt >= MAX_POST_ATTEMPTS) {
        this.logger.debug(
          `Skipping post for response ${job.responseId}: not claimable (already decided further).`
        );
        return;
      }

      if (await this.reschedule(job, attempt, RECORD_RECHECK_DELAY_MS, { releaseClaim: false })) {
        this.logger.warn(
          `Response ${job.responseId} is still approved but another attempt holds the claim; checking again in ${Math.round(RECORD_RECHECK_DELAY_MS / 1000)}s in case that attempt died.`
        );
      }
    } catch (error) {
      this.logger.error(
        `Could not re-check unclaimable response ${job.responseId}: ${this.messageOf(error)}`
      );
    }
  }

  private async reschedule(
    job: IReviewPostJob,
    attempt: number,
    delayMs: number,
    options: { releaseClaim: boolean }
  ): Promise<boolean> {
    try {
      if (options.releaseClaim) {
        await this.reviewSyncDbService.releaseResponseClaim({
          responseId: job.responseId,
          tenantId: job.tenantId,
        });
      }
      await this.reviewPostQueue.addPostJob({ ...job, attempt: attempt + 1 }, { delayMs });
      return true;
    } catch (error) {
      this.logger.error(
        `Could not reschedule post for response ${job.responseId}: ${this.messageOf(error)}`
      );
      return false;
    }
  }

  private transientDelayMs(attempt: number, error: unknown): number {
    const base =
      TRANSIENT_RETRY_DELAYS_MS[attempt - 1] ?? TRANSIENT_RETRY_DELAYS_MS.at(-1) ?? 60_000;
    if (error instanceof ProviderRateLimitError && error.retryAfterSeconds !== null) {
      return Math.max(base, error.retryAfterSeconds * 1000);
    }
    return base;
  }

  /** Records `post_failed` without letting a failure of that write mask the original error. */
  /**
   * Google answers 404 once the reviewer has deleted the review. Nothing can reply to it any more, so the review is
   * recorded as removed (which also stops Post, Retry and manual replies) and the reply fails with that reason rather
   * than Google's raw error. Terminal and expected, so it is not rethrown as a job failure.
   */
  private async handleReviewRemovedUpstream(job: IReviewPostJob): Promise<void> {
    try {
      await this.reviewSyncDbService.markReviewRemovedUpstream({
        reviewId: job.reviewId,
        tenantId: job.tenantId,
      });
    } catch (error) {
      this.logger.error(
        `Could not record review ${job.reviewId} as removed on Google: ${this.messageOf(error)}`
      );
    }

    await this.markFailedSafely(job.responseId, MESSAGES.REVIEWS.POST_FAILED_REVIEW_REMOVED);
    this.logger.warn(
      `Not posting response ${job.responseId}: Google has no review ${job.reviewId} any more (deleted by its author).`
    );
  }

  private async markFailedSafely(responseId: string, errorMessage: string): Promise<void> {
    try {
      await this.reviewSyncDbService.markResponsePostFailed({ responseId, errorMessage });
    } catch (error) {
      this.logger.error(
        `Could not record post_failed for response ${responseId}: ${this.messageOf(error)}`
      );
    }
  }

  /** The reason the owner is shown for a failed post; the raw error stays in the log. */
  private reasonFor(error: unknown): string {
    if (
      error instanceof ProviderAuthError ||
      error instanceof CredentialReferenceUnresolvableError
    ) {
      return MESSAGES.REVIEWS.POST_FAILED_RECONNECT;
    }
    if (error instanceof ProviderRateLimitError || error instanceof ProviderUnavailableError) {
      return MESSAGES.REVIEWS.POST_FAILED_UNAVAILABLE;
    }
    if (error instanceof ProviderMappingError) {
      return MESSAGES.REVIEWS.POST_FAILED_REJECTED;
    }
    return MESSAGES.REVIEWS.POST_FAILED_UNKNOWN;
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
