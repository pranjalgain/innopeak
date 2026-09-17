import type { AuthUser } from '@auth/types/auth-user.type';
import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { ResponseStatus } from '@common/enums/response-status.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import type {
  ReviewResponseRow,
  ReviewRow,
} from '@db/repositories/review-sync/reviews-read.repository';
import { Injectable, NotFoundException } from '@nestjs/common';

import { REVIEWS_PAGE_SIZE_DEFAULT } from './constants/reviews.constants';
import type {
  LatestResponseDto,
  ReviewDetailResponseDto,
  ReviewListItemDto,
  ReviewListResponseDto,
  ReviewResponseItemDto,
} from './dto/review-response.dto';
import { ClientResponseStatus } from './enums/client-response-status.enum';

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
  constructor(private readonly reviewSyncDbService: ReviewSyncDbService) {}

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
      throw new NotFoundException({
        message: MESSAGES.REVIEWS.REVIEW_NOT_FOUND,
        code: 'REVIEW_NOT_FOUND',
      });
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

      return {
        id: response.id,
        generationGroupId: response.generationGroupId,
        label: String.fromCharCode(65 + index),
        responseType: response.responseType,
        content: response.content,
        originalContent: response.originalContent,
        source: response.source,
        status: RESPONSE_STATUS_PROJECTION[response.status],
        createdByUserId: response.createdByUserId,
        approvedByUserId: response.approvedByUserId,
        createdAt: response.createdAt,
        decidedAt: response.decidedAt,
        postedAt: response.postedAt,
        errorMessage: response.errorMessage,
      };
    });
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
