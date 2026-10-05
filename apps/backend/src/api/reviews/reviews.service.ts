import type { AuthUser } from '@auth/types/auth.type';
import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { ResponseSource } from '@common/enums/response-source.enum';
import { ResponseStatus } from '@common/enums/response-status.enum';
import { ResponseType } from '@common/enums/response-type.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
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
  ReviewNotFoundException,
  ReviewRemovedUpstreamException,
  ReviewResponseAlreadyLiveException,
  ReviewResponseNotApprovableException,
  ReviewResponseNotFoundException,
} from './exceptions/reviews.exceptions';

/** `idx_review_responses_review_id_live_reply` — Postgres reports the index name as `constraint`
 *  for a unique-index (not a named-constraint) violation. Matches the constant `ReviewSyncDbService`
 *  itself guards this index against, kept local here since `isUniqueViolation` is checked at this
 *  layer, not the DB service (see `approveReply`'s own comment for why). */
const LIVE_REPLY_INDEX = 'idx_review_responses_review_id_live_reply';

/**
 * The seven-value `response_status` enum projected onto the four the shipped frontend understands.
 *
 * `reply-draft-card.tsx` treats its `ReplyDraftStatus` union as exhaustive — its badge lookup is a
 * `Record<ReviewReplyDraft["status"], string>` and its label comes from a translation key that
 * exists for exactly these four values. Emitting a raw `posted`, `post_failed` or `draft` yields an
 * unstyled badge and a missing translation key; `draft` additionally renders as un-actionable,
 * because the card computes `isDecided = status !== "pending_approval"`.
 *
 * `posted` and `post_failed` both fold into `approved` because they are the same *decision* —
 * delivery is an implementation detail of it, and belongs on the dedicated post-status route.
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
    private readonly settingsDbService: SettingsDbService,
    private readonly reviewPostQueue: ReviewPostQueue
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

    // One query for the whole page's responses rather than one per review — a 20-item queue would
    // otherwise be 21 round trips just to render its status badges.
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
      // Nested inside data — TransformInterceptor rebuilds the envelope and would drop a
      // top-level meta.
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  /**
   * Returns **every** response, terminal ones included. Rejected and superseded rows are shown
   * greyed out with their outcome copy — the audit value of showing a user what happened to the
   * sibling they did not pick is the whole reason `superseded` is a state rather than a delete.
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
   * "Latest" is the highest-precedence *live* row, not simply the newest: a `posted`/`approved` row
   * if one exists (at most one can), otherwise the most recently created. Taking the newest row
   * outright would let a later `rejected` sibling shadow the reply that is actually live on Google.
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
   * `label` is derived, not stored — there is no label column. The frontend's "Snippet A" /
   * "Snippet B" is the row's position within its `generationGroupId`, computed server-side so the
   * letter is stable across clients rather than depending on receive order.
   */
  private toResponseItems(responses: ReviewResponseRow[]): ReviewResponseItemDto[] {
    const positionInGroup = new Map<string, number>();

    return responses.map(response => {
      // A null group — a lone auto-reply suggestion, a manual reply, an imported reply — is its
      // own group of one and gets 'A'.
      const groupKey = response.generationGroupId ?? response.id;
      const index = positionInGroup.get(groupKey) ?? 0;
      positionInGroup.set(groupKey, index + 1);

      return this.toResponseItem(response, String.fromCharCode(65 + index));
    });
  }

  /** The per-item half of `toResponseItems`, pulled out so `approveReply`/`rejectReply` can map a
   *  single decided row without re-deriving every sibling's label — a decision response's own
   *  label never changes, so `'A'` here is a placeholder the client will overwrite on its next
   *  `getReview` refetch, not something a caller should rely on being correct in isolation. */
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
   * Approves a pending draft, optionally with edited content — landing it at `status = 'approved'`.
   *
   * `isUniqueViolation` is caught at this layer, not `ReviewSyncDbService`'s — the same
   * service-not-DB-service split `PromptsService.createVersion` already established for its own
   * equivalent conflict, keeping NestJS HTTP exception classes out of the data layer.
   *
   * Posting is then gated on `tenant_settings.auto_post_enabled` — see `postIfAutoPostEnabled`'s
   * own comment. This applies after **any** human approval through this route, escalation snippet
   * included: the product decision to keep escalated reviews behind an explicit human action only
   * exempts the *system's own* auto-approve step (`AiReplyGenerationService
   * .maybeAutoApproveAndPost`, scoped to non-escalated drafts) from running unattended — once a
   * human has actually clicked approve here, `auto_post_enabled` governs posting the same way for
   * every response type, exactly as it does for the system's own non-escalated auto-approval.
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

    const finalContent = input.content ?? existing.content;
    // `originalContent` is null for human_manual/imported rows, which never had an AI draft to
    // diverge from — comparing against `existing.content` in that case makes "edited" correctly
    // unreachable for them, rather than comparing against a fabricated original.
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

    return this.toResponseItem(approved);
  }

  /**
   * The "second click" gate: once a response is `approved` (by a human here, or by the system in
   * `AiReplyGenerationService.maybeAutoApproveAndPost` for a non-escalated auto-generated draft),
   * `tenant_settings.auto_post_enabled` decides whether that also posts immediately or waits for
   * the explicit `.../responses/:responseId/post` route. Deliberately best-effort: a failure here
   * must not undo an approval that already committed — the response stays a legitimate `approved`
   * row either way, just without a job queued behind it, and the manual `post` route is always
   * available as a fallback.
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

  /** Dismissed and removed-on-Google reviews cannot take a reply: fail up front with a clear error
   *  instead of queueing a post Google will reject. */
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

  /** No free-text rejection reason — only who rejected it and when (`rejectedByUserId`/`decidedAt`),
   *  mirroring `approvedByUserId`'s own tracking shape. */
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
   * The `post_failed -> approved` arrow in PLAN.md §4.2. Re-enqueues the identical post-back job,
   * including its freshness check — re-running that check, not just the raw API call, is the whole
   * point of retrying through this route rather than a blind resend: by the time someone clicks
   * retry, the review may well have been answered another way since the failed attempt.
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
    });
    if (!review) {
      throw new ReviewNotFoundException();
    }
    this.assertReviewAcceptsReply(review);

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
        // A different sibling was approved while this one sat at post_failed — see
        // `api-reference.md`'s own callout for this exact ordering hazard.
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

  /**
   * The manual trigger for the `auto_post_enabled = false` case — the "second click"
   * `postIfAutoPostEnabled`'s own comment describes. Not part of this module's originally
   * documented spec (which predates `auto_post_enabled` being wired to anything); added because
   * the existing design note for that flag directly implies it.
   */
  async postResponse(input: {
    user: AuthUser;
    reviewId: string;
    responseId: string;
  }): Promise<PostQueuedResponseDto> {
    const tenantUser = requireTenantUser(input.user, MESSAGES.REVIEWS.TENANT_ONLY);

    const review = await this.reviewSyncDbService.findReviewForTenant({
      reviewId: input.reviewId,
      tenantId: tenantUser.tenantId,
    });
    if (!review) {
      throw new ReviewNotFoundException();
    }
    this.assertReviewAcceptsReply(review);

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

  /** Reads the outcome of the asynchronous post-back — separate from `getReview` so a client that
   *  wants to poll delivery state does not have to re-read every response row for the review on
   *  every tick; see this route's own Swagger description for the looser throttle tier that makes
   *  that polling legitimate. */
  async getPostStatus(input: {
    user: AuthUser;
    reviewId: string;
    responseId: string;
  }): Promise<PostStatusResponseDto> {
    const tenantUser = requireTenantUser(input.user, MESSAGES.REVIEWS.TENANT_ONLY);

    const review = await this.reviewSyncDbService.findReviewForTenant({
      reviewId: input.reviewId,
      tenantId: tenantUser.tenantId,
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
   * Writes a reply from scratch instead of approving a generated one — `source = 'human_manual'`.
   * `response_type` is never accepted from the client: it is derived from the review's own
   * classification (`escalation_snippet` when escalated, `auto_reply_suggestion` otherwise), since
   * it records *why a reply exists*, a property of the review, not of who typed the text.
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
    });
    if (!review) {
      throw new ReviewNotFoundException();
    }
    this.assertReviewAcceptsReply(review);

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
