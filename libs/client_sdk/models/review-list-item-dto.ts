// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { LatestResponseDto } from './latest-response-dto';

export interface ReviewListItemDto {
  id: string;
  locationId: string;
  reviewerName?: object | null;
  rating: number;
  reviewText?: object | null;
  reviewedAt?: object | null;
  sentiment?: ReviewListItemDtoSentimentEnum | null;
  classification: ReviewListItemDtoClassificationEnum;
  escalationReason?: ReviewListItemDtoEscalationReasonEnum | null;
  matchedKeywords?: Array<string> | null;
  status: ReviewListItemDtoStatusEnum;
  anonymizedAt?: object | null;
  removedUpstreamAt?: object | null;
  responseCount: number;
  latestResponse?: LatestResponseDto | null;
}

export const ReviewListItemDtoSentimentEnum = {
  Positive: 'positive',
  Neutral: 'neutral',
  Negative: 'negative',
} as const;

export type ReviewListItemDtoSentimentEnum =
  (typeof ReviewListItemDtoSentimentEnum)[keyof typeof ReviewListItemDtoSentimentEnum];
export const ReviewListItemDtoClassificationEnum = {
  AutoReplyCandidate: 'auto_reply_candidate',
  Escalated: 'escalated',
  PendingClassification: 'pending_classification',
} as const;

export type ReviewListItemDtoClassificationEnum =
  (typeof ReviewListItemDtoClassificationEnum)[keyof typeof ReviewListItemDtoClassificationEnum];
export const ReviewListItemDtoEscalationReasonEnum = {
  LowRating: 'low_rating',
  BlocklistMatch: 'blocklist_match',
} as const;

export type ReviewListItemDtoEscalationReasonEnum =
  (typeof ReviewListItemDtoEscalationReasonEnum)[keyof typeof ReviewListItemDtoEscalationReasonEnum];
export const ReviewListItemDtoStatusEnum = {
  New: 'new',
  InReview: 'in_review',
  Responded: 'responded',
  Dismissed: 'dismissed',
} as const;

export type ReviewListItemDtoStatusEnum =
  (typeof ReviewListItemDtoStatusEnum)[keyof typeof ReviewListItemDtoStatusEnum];
