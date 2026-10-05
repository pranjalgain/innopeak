import { IReviewPostJob } from '@bg/interfaces/job.interface';
import { MESSAGES } from '@common/constants/messages.constants';
import { POST_CLAIM_STALE_MINUTES } from '@common/constants/review-post.constants';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import type { ReviewRow } from '@db/repositories/review-sync/types/review-sync.type';
import { Injectable, Logger } from '@nestjs/common';
import {
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderUnavailableError,
} from '@review-provider/errors/provider.error';
import { ProviderCredentialService } from '@review-provider/provider-credential.service';
import { ReviewProvider } from '@review-provider/providers/review-provider.provider';

import { ReviewPostQueue } from './review-post.queue';
import { normalizeReplyText } from './review-post.util';

/** Total tries (first attempt included) for a transient provider failure or a post-success DB
 *  failure before the response is given up on. */
const MAX_POST_ATTEMPTS = 3;

/** Wait before the 2nd and 3rd attempt after a transient provider error (429 / 5xx / network). */
const TRANSIENT_RETRY_DELAYS_MS = [60_000, 5 * 60_000];

/** Wait before re-checking a response whose Google call succeeded but whose DB write failed. Must
 *  outlast the claim's staleness window, or the re-check could not claim the still-held row. */
const RECORD_RECHECK_DELAY_MS = (POST_CLAIM_STALE_MINUTES + 1) * 60_000;

/** What talking to Google established, before anything is written locally. */
type PostOutcome =
  | { kind: 'external'; content: string; postedAt: string }
  | { kind: 'posted'; content: string; postedAt: string };

/**
 * The freshness-check-then-post business logic PLAN.md §8.12 and `review-pipeline/overview.md`'s
 * "Posting back to Google" section both describe — the one genuinely new piece of logic in this
 * queue; the processor/consumer/queue files around it are adapt-and-rename boilerplate from the
 * `email` queue's shape (see that queue's own module doc comments).
 *
 * Transport-agnostic, like `ReviewSyncQueueService`: both the BullMQ processor and the SQS
 * consumer call `postResponse` and neither contains logic of its own.
 *
 * **Retries are this class's own, not the queue's.** The queue runs `attempts: 1`: a blind
 * transport retry would replay a stale decision instead of re-running the freshness check, per
 * `review-pipeline/overview.md`'s explicit warning. Instead a *transient* failure (rate limit,
 * 5xx, network) releases the claim and re-enqueues a fresh job with `attempt + 1` and a delay —
 * every attempt starts again at the claim and the freshness check. Anything else (a dead grant, an
 * unmappable response) is terminal for this attempt and is left for the user's `retry-post`.
 */
@Injectable()
export class ReviewPostQueueService {
  private readonly logger = new Logger(ReviewPostQueueService.name);

  constructor(
    private readonly provider: ReviewProvider,
    private readonly credentialService: ProviderCredentialService,
    private readonly connectionsDbService: ConnectionsDbService,
    private readonly reviewSyncDbService: ReviewSyncDbService,
    private readonly reviewPostQueue: ReviewPostQueue
  ) {}

  async postResponse(job: IReviewPostJob): Promise<void> {
    const attempt = job.attempt ?? 1;

    const claimed = await this.reviewSyncDbService.claimResponseForPosting({
      responseId: job.responseId,
      tenantId: job.tenantId,
    });

    if (!claimed) {
      this.logger.debug(
        `Skipping post for response ${job.responseId}: not claimable (already decided further, or claimed by a still-in-flight attempt).`
      );
      return;
    }

    const review = await this.reviewSyncDbService.findReviewForTenant({
      reviewId: job.reviewId,
      tenantId: job.tenantId,
    });

    if (!review) {
      // Should not happen — the response row FKs to it — but fail loudly rather than leave the
      // claim stuck at `approved` with a `post_attempted_at` nothing will ever clear.
      const message = `Review ${job.reviewId} not found while posting response ${job.responseId}`;
      await this.markFailedSafely(job.responseId, message);
      throw new Error(message);
    }

    if (review.removedUpstreamAt !== null) {
      // Nothing to send the reply to — fail it up front with a clear reason instead of a Google 404.
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
   * Everything that talks to Google, kept apart from the local writes so a database failure can
   * never be mistaken for a failed post (the reply may already be live by then).
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

    // PLAN.md §8.12 — fetched fresh, immediately before posting, never from our own last-polled
    // copy of the review.
    const existingReply = await this.provider.getReviewReply(accessToken, providerInput);

    if (existingReply !== null) {
      if (normalizeReplyText(existingReply.comment) === normalizeReplyText(content)) {
        // Our own reply from a prior attempt that crashed between the Google PUT succeeding and
        // this response's own `markResponsePosted` committing — see `0004_reviews.sql`'s
        // `post_attempted_at` comment. Recorded as posted rather than re-sent: Google's reply
        // endpoint is an unconditional upsert, so re-posting identical content would be harmless
        // but is still a pointless second write.
        this.logger.log(
          `Response ${job.responseId} was already live on Google from a prior attempt; recording it as posted without re-sending.`
        );
        return { kind: 'posted', content, postedAt: existingReply.updatedAt };
      }

      // Someone replied another way (directly on Google, or a race with another worker) — abort
      // rather than overwrite it. See ReviewSyncRepository.supersedeForExternalReply.
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
   * The local writes after Google has been dealt with. A lost compare-and-swap here (the response
   * stopped being `approved` while the worker was talking to Google — a human rejected or edited
   * it) is not success: the reply is, or already was, live on Google, so what Google actually has
   * is imported rather than left out of the record.
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
   * A failure before or during the Google call. Transient ones are rescheduled (up to
   * `MAX_POST_ATTEMPTS`); the rest — and an exhausted transient — mark the response `post_failed`
   * and rethrow so the queue's failed-job handling still sees them.
   */
  private async handleProviderFailure(
    job: IReviewPostJob,
    attempt: number,
    error: unknown
  ): Promise<void> {
    if (error instanceof ProviderAuthError) {
      // PLAN.md §8.14 — the same "record a dead grant on the connection, not just report it"
      // requirement ReviewSyncQueueService.handleSyncFailure honours for the read path.
      try {
        const connection = await this.connectionsDbService.findConnectionByTenant(job.tenantId);
        if (connection) {
          await this.connectionsDbService.markNeedsReauth(connection.id);
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

    await this.markFailedSafely(job.responseId, this.messageOf(error));
    this.logger.error(
      `Failed to post response ${job.responseId} for review ${job.reviewId}: ${this.messageOf(error)}`
    );
    throw error;
  }

  /**
   * A local write failed *after* Google was dealt with, so the reply is — or may be — already live.
   * Marking the response `post_failed` would be wrong (it is not failed, and the database may be the
   * very thing that is down). The claim is left in place; a re-check job after the claim goes stale
   * runs the freshness check, finds the reply, and records it. Only once attempts are exhausted
   * does this give up loudly, leaving the row `approved` for a manual post or retry (which hits the
   * same own-reply check).
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

  /** Records `post_failed` without letting a failure of that write mask the error that caused it. */
  private async markFailedSafely(responseId: string, errorMessage: string): Promise<void> {
    try {
      await this.reviewSyncDbService.markResponsePostFailed({ responseId, errorMessage });
    } catch (error) {
      this.logger.error(
        `Could not record post_failed for response ${responseId}: ${this.messageOf(error)}`
      );
    }
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
