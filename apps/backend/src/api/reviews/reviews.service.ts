import type { AuthUser } from '@auth/types/auth.type';
import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { InAppNotificationType } from '@common/enums/in-app-notification-type.enum';
import { LocationStatus } from '@common/enums/location-status.enum';
import { ResponseSource } from '@common/enums/response-source.enum';
import { ResponseStatus } from '@common/enums/response-status.enum';
import { ResponseType } from '@common/enums/response-type.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import type {
  ReviewResponseRow,
  ReviewRow,
} from '@db/repositories/review-sync/types/review-sync.type';
import { SettingsDbService } from '@db/repositories/settings/settings.db-service';
import { Injectable, Logger } from '@nestjs/common';
import { enqueuePostOrMarkFailed } from '@review-post-queue/enqueue-post-or-mark-failed.util';
import { ReviewPostQueue } from '@review-post-queue/review-post.queue';

import { REVIEWS_PAGE_SIZE_DEFAULT } from './constants/reviews.constants';
import { CreateManualReplyDto } from './dto/create-manual-reply.dto';
import type {
  ManualReplyResponseDto,
  PostQueuedResponseDto,
  PostStatusResponseDto,
  RetryPostResponseDto,
} from './dto/post-actions.dto';
import type {
  LatestResponseDto,
  ReviewDetailResponseDto,
  ReviewListItemDto,
  ReviewListResponseDto,
  ReviewResponseItemDto,
} from './dto/review-response.dto';
import { ClientResponseStatus } from './enums/client-response-status.enum';
import {
  PostQueueUnavailableException,
  ResponseNotPostableException,
  ResponseNotRetryableException,
  ReviewAlreadyDismissedException,
  ReviewAlreadyHasLiveReplyException,
  ReviewLocationPausedException,
  ReviewNotFoundException,
  ReviewRemovedUpstreamException,
  ReviewResponseAlreadyLiveException,
  ReviewResponseNotApprovableException,
  ReviewResponseNotFoundException,
} from './exceptions/reviews.exceptions';

import { InAppNotificationsService } from '../notifications/services/in-app-notifications.service';

/** Postgres reports a unique-index (not named-constraint) violation's index name as `constraint`; checked at
 *  this layer, not the DB service (see `approveReply`). */
const LIVE_REPLY_INDEX = 'idx_review_responses_review_id_live_reply';

/**
 * The seven `response_status` values folded onto the four the frontend understands: `reply-draft-card.tsx`
 * treats its status union as exhaustive (badge map + translation keys), so a raw `posted`/`post_failed`/`draft`
 * would render unstyled and untranslated. `posted`/`post_failed` fold into `approved`; delivery belongs on the
 * post-status route.
 */
const RESPONSE_STATUS_PROJECTION: Record<ResponseStatus, ClientResponseStatus> = {
  [ResponseStatus.DRAFT]: ClientResponseStatus.PENDING_APPROVAL,
  [ResponseStatus.PENDING_APPROVAL]: ClientResponseStatus.PENDING_APPROVAL,
  [ResponseStatus.APPROVED]: ClientResponseStatus.APPROVED,
  [ResponseStatus.POSTED]: ClientResponseStatus.APPROVED,
  [ResponseStatus.POST_FAILED]: ClientResponseStatus.APPROVED,
  [ResponseStatus.REJECTED]: ClientResponseStatus.REJECTED,
  [ResponseStatus.SUPERSEDED]: ClientResponseStatus.SUPERSEDED,
};

/** Rows that represent the live reply — at most one can exist per review by partial unique index. */
const LIVE_STATUSES = new Set<ResponseStatus>([ResponseStatus.POSTED, ResponseStatus.APPROVED]);

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly reviewSyncDbService: ReviewSyncDbService,
    private readonly connectionsDbService: ConnectionsDbService,
    private readonly settingsDbService: SettingsDbService,
    private readonly reviewPostQueue: ReviewPostQueue,
    private readonly inAppNotificationsService: InAppNotificationsService
  ) {}

  async listReviews(input: {
    user: AuthUser;
    page?: number | undefined;
    pageSize?: number | undefined;
    status?: ReviewStatus | undefined;
    classification?: ReviewClassification | undefined;
    locationId?: string | undefined;
    search?: string | undefined;
  }): Promise<ReviewListResponseDto> {
    const tenantUser = requireTenantUser(input.user, MESSAGES.REVIEWS.TENANT_ONLY);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? REVIEWS_PAGE_SIZE_DEFAULT;

    const { reviews, total } = await this.reviewSyncDbService.listReviews({
      tenantId: tenantUser.tenantId,
      page,
      pageSize,
      status: input.status,
      classification: input.classification,
      locationId: input.locationId,
      search: input.search,
    });

    // One query for the page's responses, not one per review (a 20-item queue would be 21 round trips).
    const responses = await this.reviewSyncDbService.findResponsesForReviews({
      reviewIds: reviews.map(review => review.id),
      tenantId: tenantUser.tenantId,
    });
    const byReview = this.groupByReview(responses);

    return {
      data: reviews.map(review => {
        const reviewResponses = byReview.get(review.id) ?? [];
        return {
          ...this.toListItem(review),
          responseCount: reviewResponses.length,
          latestResponse: this.pickLatestResponse(reviewResponses),
        };
      }),
      // Nested inside data: TransformInterceptor rebuilds the envelope and would drop a top-level meta.
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  /**
   * Returns every response, terminal ones included: showing what happened to the sibling a user did not
   * pick is why `superseded` is a state rather than a delete.
   */
  async getReview(input: { user: AuthUser; reviewId: string }): Promise<ReviewDetailResponseDto> {
    const tenantUser = requireTenantUser(input.user, MESSAGES.REVIEWS.TENANT_ONLY);
    const review = await this.reviewSyncDbService.findReviewForTenant({
      reviewId: input.reviewId,
      tenantId: tenantUser.tenantId,
    });

    if (!review) {
      throw new ReviewNotFoundException();
    }

    const responses = await this.reviewSyncDbService.findResponsesForReviews({
      reviewIds: [review.id],
      tenantId: tenantUser.tenantId,
    });

    return {
      ...this.toListItem(review),
      externalReviewId: review.externalReviewId,
      externalUpdatedAt: review.externalUpdatedAt,
      responseCount: responses.length,
      latestResponse: this.pickLatestResponse(responses),
      responses: this.toResponseItems(responses),
    };
  }

  private toListItem(
    review: ReviewRow
  ): Omit<ReviewListItemDto, 'latestResponse' | 'responseCount'> {
    return {
      id: review.id,
      locationId: review.locationId,
      reviewerName: review.reviewerName,
      rating: review.rating,
      reviewText: review.reviewText,
      reviewedAt: review.reviewedAt,
      sentiment: review.sentiment,
      classification: review.classification,
      escalationReason: review.escalationReason,
      matchedKeywords: review.matchedKeywords,
      status: review.status,
      anonymizedAt: review.anonymizedAt,
      removedUpstreamAt: review.removedUpstreamAt,
    };
  }

  /**
   * "Latest" is the highest-precedence live row (`posted`/`approved`, at most one), else the newest; the
   * newest outright would let a later `rejected` sibling shadow the reply that is live on Google.
   */
  private pickLatestResponse(responses: ReviewResponseRow[]): LatestResponseDto | null {
    if (responses.length === 0) {
      return null;
    }

    const live = responses.find(response => LIVE_STATUSES.has(response.status));
    const chosen = live ?? responses[responses.length - 1];

    if (!chosen) {
      return null;
    }

    return {
      id: chosen.id,
      status: RESPONSE_STATUS_PROJECTION[chosen.status],
      responseType: chosen.responseType,
      source: chosen.source,
      createdAt: chosen.createdAt,
    };
  }

  /**
   * `label` is derived (no column): the row's position within its `generationGroupId`, computed server-side
   * so the letter is stable across clients.
   */
  private toResponseItems(responses: ReviewResponseRow[]): ReviewResponseItemDto[] {
    const positionInGroup = new Map<string, number>();

    return responses.map(response => {
      // A null group (lone suggestion, manual or imported reply) is its own group of one.
      const groupKey = response.generationGroupId ?? response.id;
      const index = positionInGroup.get(groupKey) ?? 0;
      positionInGroup.set(groupKey, index + 1);

      return this.toResponseItem(response, String.fromCharCode(65 + index));
    });
  }

  /** The `'A'` default is a placeholder the client overwrites on its next `getReview` refetch. */
  private toResponseItem(response: ReviewResponseRow, label = 'A'): ReviewResponseItemDto {
    return {
      id: response.id,
      generationGroupId: response.generationGroupId,
      label,
      responseType: response.responseType,
      content: response.content,
      originalContent: response.originalContent,
      source: response.source,
      status: RESPONSE_STATUS_PROJECTION[response.status],
      createdByUserId: response.createdByUserId,
      approvedByUserId: response.approvedByUserId,
      rejectedByUserId: response.rejectedByUserId,
      createdAt: response.createdAt,
      decidedAt: response.decidedAt,
      postedAt: response.postedAt,
      errorMessage: response.errorMessage,
    };
  }

  /**
   * `isUniqueViolation` is caught here, not in `ReviewSyncDbService`, to keep HTTP exception classes out of
   * the data layer (same split as `PromptsService.createVersion`).
   * Posting is then gated on `auto_post_enabled` after any human approval, escalation snippets included;
   * only the system's own auto-approve (`AiReplyGenerationService.maybeAutoApproveAndPost`) skips escalated drafts.
   */
  async approveReply(input: {
    user: AuthUser;
    reviewId: string;
    responseId: string;
    content?: string | undefined;
  }): Promise<ReviewResponseItemDto> {
    const tenantUser = requireTenantUser(input.user, MESSAGES.REVIEWS.TENANT_ONLY);

    const existing = await this.reviewSyncDbService.findResponseForTenant({
      responseId: input.responseId,
      reviewId: input.reviewId,
      tenantId: tenantUser.tenantId,
    });
    if (!existing) {
      throw new ReviewResponseNotFoundException();
    }

    // Same gates as every other way of answering a review: a dismissed or removed review, or a paused location, takes no reply.
    const review = await this.reviewSyncDbService.findReviewForTenant({
      reviewId: input.reviewId,
      tenantId: tenantUser.tenantId,
      includePaused: true,
    });
    if (!review) {
      throw new ReviewNotFoundException();
    }
    this.assertReviewAcceptsReply(review);
    await this.assertLocationAcceptsReplies(tenantUser.tenantId, review.locationId);

    const finalContent = input.content ?? existing.content;
    // `originalContent` is null for human_manual/imported rows (no AI draft), so "edited" is unreachable for them.
    const baseline = existing.originalContent ?? existing.content;
    const source = finalContent !== baseline ? ResponseSource.HUMAN_EDITED : existing.source;

    let approved: ReviewResponseRow | null;
    try {
      approved = await this.reviewSyncDbService.approveResponse({
        responseId: input.responseId,
        reviewId: input.reviewId,
        tenantId: tenantUser.tenantId,
        approvedByUserId: tenantUser.id,
        content: finalContent,
        source,
      });
    } catch (error) {
      if (isUniqueViolation(error, LIVE_REPLY_INDEX)) {
        throw new ReviewResponseAlreadyLiveException();
      }
      throw error;
    }

    if (!approved) {
      throw new ReviewResponseNotApprovableException();
    }

    await this.postIfAutoPostEnabled(tenantUser.tenantId, input.reviewId, approved.id);
    // Not awaited: the lookup, the recipients query, the insert and the Redis publish are all for the team's benefit, and the person who
    // clicked Approve should not wait on them (with Redis degraded that is half a second on every approval). It never rejects.
    void this.announceApproval({
      tenantId: tenantUser.tenantId,
      reviewId: input.reviewId,
      rating: review.rating,
      approvedByUserId: tenantUser.id,
    });

    return this.toResponseItem(approved);
  }

  /**
   * Tells the rest of the team a reply was approved (not the person who did it). Best-effort, like the post step: a notice must never
   * undo or fail an approval that already committed. Never rejects, so the caller can leave it running.
   */
  private async announceApproval(input: {
    tenantId: string;
    reviewId: string;
    rating: number;
    approvedByUserId: string;
  }): Promise<void> {
    try {
      await this.inAppNotificationsService.publish(input.tenantId, [
        {
          type: InAppNotificationType.REPLY_APPROVED,
          reviewId: input.reviewId,
          rating: input.rating,
          actorUserId: input.approvedByUserId,
        },
      ]);
    } catch (error) {
      this.logger.error(
        `Could not announce the approval on review ${input.reviewId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * The "second click" gate: once approved, `auto_post_enabled` decides whether to post now or wait for the
   * manual `post` route. Best-effort: a failure must not undo an approval that already committed.
   */
  private async postIfAutoPostEnabled(
    tenantId: string,
    reviewId: string,
    responseId: string
  ): Promise<void> {
    try {
      const autoPostEnabled = await this.settingsDbService.findAutoPostEnabled(tenantId);
      if (!autoPostEnabled) {
        return;
      }
    } catch (error) {
      this.logger.error(
        `Could not read auto_post_enabled for tenant ${tenantId}; response ${responseId} stays approved and can still be posted manually: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return;
    }

    // If the queue is unreachable the response goes to `post_failed` (visible, retryable), never
    // left `approved` with no job behind it.
    await this.enqueuePost({ tenantId, reviewId, responseId });
  }

  private enqueuePost(job: {
    tenantId: string;
    reviewId: string;
    responseId: string;
  }): Promise<boolean> {
    return enqueuePostOrMarkFailed(
      {
        reviewPostQueue: this.reviewPostQueue,
        reviewSyncDbService: this.reviewSyncDbService,
        logger: this.logger,
      },
      job
    );
  }

  /**
   * A location the plan has paused (or the owner disconnected) takes no replies: its polling is off and the post worker refuses it, so
   * approving here would only leave a reply stuck at `approved`. Refused up front with a reason the owner can act on.
   */
  private async assertLocationAcceptsReplies(tenantId: string, locationId: string): Promise<void> {
    const location = await this.connectionsDbService.findLocationForTenant(locationId, tenantId);
    if (location?.status !== LocationStatus.ACTIVE || location.billingPausedAt !== null) {
      throw new ReviewLocationPausedException();
    }
  }

  /** Dismissed and removed-on-Google reviews cannot take a reply; fail up front rather than queue a post Google will reject. */
  private assertReviewAcceptsReply(review: {
    status: ReviewStatus;
    removedUpstreamAt: string | null;
  }): void {
    if (review.status === ReviewStatus.DISMISSED) {
      throw new ReviewAlreadyDismissedException();
    }
    if (review.removedUpstreamAt !== null) {
      throw new ReviewRemovedUpstreamException();
    }
  }

  /** No free-text reason; only who rejected it and when, mirroring `approvedByUserId`. */
  async rejectReply(input: {
    user: AuthUser;
    reviewId: string;
    responseId: string;
  }): Promise<ReviewResponseItemDto> {
    const tenantUser = requireTenantUser(input.user, MESSAGES.REVIEWS.TENANT_ONLY);

    const existing = await this.reviewSyncDbService.findResponseForTenant({
      responseId: input.responseId,
      reviewId: input.reviewId,
      tenantId: tenantUser.tenantId,
    });
    if (!existing) {
      throw new ReviewResponseNotFoundException();
    }

    const rejected = await this.reviewSyncDbService.rejectResponse({
      responseId: input.responseId,
      reviewId: input.reviewId,
      tenantId: tenantUser.tenantId,
      rejectedByUserId: tenantUser.id,
    });
    if (!rejected) {
      throw new ReviewResponseNotApprovableException();
    }
    return this.toResponseItem(rejected);
  }

  /**
   * `post_failed -> approved`. Re-enqueues the identical post-back job so its freshness check re-runs:
   * the review may have been answered another way since the failed attempt.
   */
  async retryPost(input: {
    user: AuthUser;
    reviewId: string;
    responseId: string;
  }): Promise<RetryPostResponseDto> {
    const tenantUser = requireTenantUser(input.user, MESSAGES.REVIEWS.TENANT_ONLY);

    const review = await this.reviewSyncDbService.findReviewForTenant({
      reviewId: input.reviewId,
      tenantId: tenantUser.tenantId,
      includePaused: true,
    });
    if (!review) {
      throw new ReviewNotFoundException();
    }
    this.assertReviewAcceptsReply(review);
    await this.assertLocationAcceptsReplies(tenantUser.tenantId, review.locationId);

    const existing = await this.reviewSyncDbService.findResponseForTenant({
      responseId: input.responseId,
      reviewId: input.reviewId,
      tenantId: tenantUser.tenantId,
    });
    if (!existing) {
      throw new ReviewResponseNotFoundException();
    }
    if (existing.status !== ResponseStatus.POST_FAILED) {
      throw new ResponseNotRetryableException();
    }

    let retried: ReviewResponseRow | null;
    try {
      retried = await this.reviewSyncDbService.retryPostableResponse({
        responseId: input.responseId,
        tenantId: tenantUser.tenantId,
      });
    } catch (error) {
      if (isUniqueViolation(error, LIVE_REPLY_INDEX)) {
        // A different sibling was approved while this one sat at post_failed.
        throw new ReviewAlreadyHasLiveReplyException();
      }
      throw error;
    }

    if (!retried) {
      throw new ResponseNotRetryableException();
    }

    // The response is `approved` again at this point; if the queue is unreachable it is put back to
    // `post_failed` so the retry control stays available, rather than stranded with no job.
    const queued = await this.enqueuePost({
      tenantId: tenantUser.tenantId,
      reviewId: input.reviewId,
      responseId: input.responseId,
    });
    if (!queued) {
      throw new PostQueueUnavailableException();
    }

    return {
      id: retried.id,
      status: ClientResponseStatus.APPROVED,
      errorMessage: null,
      retryQueuedAt: new Date().toISOString(),
    };
  }

  /** Manual trigger for the `auto_post_enabled = false` case (see `postIfAutoPostEnabled`). */
  async postResponse(input: {
    user: AuthUser;
    reviewId: string;
    responseId: string;
  }): Promise<PostQueuedResponseDto> {
    const tenantUser = requireTenantUser(input.user, MESSAGES.REVIEWS.TENANT_ONLY);

    const review = await this.reviewSyncDbService.findReviewForTenant({
      reviewId: input.reviewId,
      tenantId: tenantUser.tenantId,
      includePaused: true,
    });
    if (!review) {
      throw new ReviewNotFoundException();
    }
    this.assertReviewAcceptsReply(review);
    await this.assertLocationAcceptsReplies(tenantUser.tenantId, review.locationId);

    const existing = await this.reviewSyncDbService.findResponseForTenant({
      responseId: input.responseId,
      reviewId: input.reviewId,
      tenantId: tenantUser.tenantId,
    });
    if (!existing) {
      throw new ReviewResponseNotFoundException();
    }
    if (existing.status !== ResponseStatus.APPROVED) {
      throw new ResponseNotPostableException();
    }

    // The response stays `approved` if this fails, so the caller can simply post again.
    try {
      await this.reviewPostQueue.addPostJob({
        tenantId: tenantUser.tenantId,
        reviewId: input.reviewId,
        responseId: input.responseId,
      });
    } catch (error) {
      this.logger.error(
        `Could not queue manual post for response ${input.responseId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new PostQueueUnavailableException();
    }

    return {
      id: existing.id,
      status: ClientResponseStatus.APPROVED,
      postQueuedAt: new Date().toISOString(),
    };
  }

  /** Separate from `getReview` so a client polling delivery state need not re-read every response row each tick. */
  async getPostStatus(input: {
    user: AuthUser;
    reviewId: string;
    responseId: string;
  }): Promise<PostStatusResponseDto> {
    const tenantUser = requireTenantUser(input.user, MESSAGES.REVIEWS.TENANT_ONLY);

    const review = await this.reviewSyncDbService.findReviewForTenant({
      reviewId: input.reviewId,
      tenantId: tenantUser.tenantId,
      // A post already queued still finishes after the location is paused; the client polling it must see how it ended, not a 404.
      includePaused: true,
    });
    if (!review) {
      throw new ReviewNotFoundException();
    }

    const existing = await this.reviewSyncDbService.findResponseForTenant({
      responseId: input.responseId,
      reviewId: input.reviewId,
      tenantId: tenantUser.tenantId,
    });
    if (!existing) {
      throw new ReviewResponseNotFoundException();
    }

    return {
      id: existing.id,
      reviewId: input.reviewId,
      status: existing.status,
      postedAt: existing.postedAt,
      errorMessage: existing.errorMessage,
      reviewStatus: review.status,
    };
  }

  /**
   * `response_type` is never client-supplied: it is derived from the review's classification
   * (`escalation_snippet` when escalated, else `auto_reply_suggestion`) since it records why a reply exists.
   */
  async createManualReply(input: {
    user: AuthUser;
    reviewId: string;
    content: CreateManualReplyDto['content'];
  }): Promise<ManualReplyResponseDto> {
    const tenantUser = requireTenantUser(input.user, MESSAGES.REVIEWS.TENANT_ONLY);

    const review = await this.reviewSyncDbService.findReviewForTenant({
      reviewId: input.reviewId,
      tenantId: tenantUser.tenantId,
      includePaused: true,
    });
    if (!review) {
      throw new ReviewNotFoundException();
    }
    this.assertReviewAcceptsReply(review);
    await this.assertLocationAcceptsReplies(tenantUser.tenantId, review.locationId);

    const responseType =
      review.classification === ReviewClassification.ESCALATED
        ? ResponseType.ESCALATION_SNIPPET
        : ResponseType.AUTO_REPLY_SUGGESTION;

    let created: { response: ReviewResponseRow; supersededResponseIds: string[] };
    try {
      created = await this.reviewSyncDbService.insertManualReply({
        tenantId: tenantUser.tenantId,
        reviewId: input.reviewId,
        responseType,
        content: input.content,
        createdByUserId: tenantUser.id,
      });
    } catch (error) {
      if (isUniqueViolation(error, LIVE_REPLY_INDEX)) {
        throw new ReviewAlreadyHasLiveReplyException();
      }
      throw error;
    }

    await this.postIfAutoPostEnabled(tenantUser.tenantId, input.reviewId, created.response.id);

    return {
      id: created.response.id,
      reviewId: input.reviewId,
      responseType: created.response.responseType,
      content: created.response.content,
      source: created.response.source,
      status: ClientResponseStatus.APPROVED,
      createdByUserId: created.response.createdByUserId,
      approvedByUserId: created.response.approvedByUserId,
      decidedAt: created.response.decidedAt,
      supersededResponseIds: created.supersededResponseIds,
      reviewStatus: review.status,
    };
  }

  private groupByReview(responses: ReviewResponseRow[]): Map<string, ReviewResponseRow[]> {
    const grouped = new Map<string, ReviewResponseRow[]>();

    for (const response of responses) {
      const existing = grouped.get(response.reviewId);
      if (existing) {
        existing.push(response);
      } else {
        grouped.set(response.reviewId, [response]);
      }
    }

    return grouped;
  }
}
