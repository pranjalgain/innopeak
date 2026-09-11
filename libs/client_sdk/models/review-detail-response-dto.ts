// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { LatestResponseDto } from './latest-response-dto';
// May contain unused imports in some cases
// @ts-ignore
import type { ReviewResponseItemDto } from './review-response-item-dto';

export interface ReviewDetailResponseDto {
  id: string;
  locationId: string;
  reviewerName?: object | null;
  rating: number;
  reviewText?: object | null;
  reviewedAt?: object | null;
  sentiment?: ReviewDetailResponseDtoSentimentEnum | null;
  classification: ReviewDetailResponseDtoClassificationEnum;
  escalationReason?: ReviewDetailResponseDtoEscalationReasonEnum | null;
  matchedKeywords?: Array<string> | null;
  status: ReviewDetailResponseDtoStatusEnum;
  anonymizedAt?: object | null;
  removedUpstreamAt?: object | null;
  responseCount: number;
  latestResponse?: LatestResponseDto | null;
  externalReviewId: string;
  /**
   * Google\'s own last-modified timestamp. Load-bearing: the poller diffs it to detect an upstream edit and supersede pending drafts.
   */
  externalUpdatedAt?: object | null;
  responses: Array<ReviewResponseItemDto>;
}

export const ReviewDetailResponseDtoSentimentEnum = {
  Positive: 'positive',
  Neutral: 'neutral',
  Negative: 'negative',
} as const;

export type ReviewDetailResponseDtoSentimentEnum =
  (typeof ReviewDetailResponseDtoSentimentEnum)[keyof typeof ReviewDetailResponseDtoSentimentEnum];
export const ReviewDetailResponseDtoClassificationEnum = {
  AutoReplyCandidate: 'auto_reply_candidate',
  Escalated: 'escalated',
  PendingClassification: 'pending_classification',
} as const;

export type ReviewDetailResponseDtoClassificationEnum =
  (typeof ReviewDetailResponseDtoClassificationEnum)[keyof typeof ReviewDetailResponseDtoClassificationEnum];
export const ReviewDetailResponseDtoEscalationReasonEnum = {
  LowRating: 'low_rating',
  BlocklistMatch: 'blocklist_match',
} as const;

export type ReviewDetailResponseDtoEscalationReasonEnum =
  (typeof ReviewDetailResponseDtoEscalationReasonEnum)[keyof typeof ReviewDetailResponseDtoEscalationReasonEnum];
export const ReviewDetailResponseDtoStatusEnum = {
  New: 'new',
  InReview: 'in_review',
  Responded: 'responded',
  Dismissed: 'dismissed',
} as const;

export type ReviewDetailResponseDtoStatusEnum =
  (typeof ReviewDetailResponseDtoStatusEnum)[keyof typeof ReviewDetailResponseDtoStatusEnum];
