// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface PostStatusResponseDto {
  id: string;
  reviewId: string;
  /**
   * The raw seven-value response_status, not the four-value client projection used elsewhere in this module — a client that reads this route genuinely wants the delivery detail, including posted/post_failed/superseded.
   */
  status: PostStatusResponseDtoStatusEnum;
  /**
   * Non-null only for \'posted\'.
   */
  postedAt?: object | null;
  /**
   * Populated on \'post_failed\'.
   */
  errorMessage?: object | null;
  /**
   * The parent review\'s own status, which becomes \'responded\' only once this response reaches posted — included so a client polling this endpoint needs no second request to update the queue badge.
   */
  reviewStatus: PostStatusResponseDtoReviewStatusEnum;
}

export const PostStatusResponseDtoStatusEnum = {
  Draft: 'draft',
  PendingApproval: 'pending_approval',
  Approved: 'approved',
  Rejected: 'rejected',
  Posted: 'posted',
  PostFailed: 'post_failed',
  Superseded: 'superseded',
} as const;

export type PostStatusResponseDtoStatusEnum =
  (typeof PostStatusResponseDtoStatusEnum)[keyof typeof PostStatusResponseDtoStatusEnum];
export const PostStatusResponseDtoReviewStatusEnum = {
  New: 'new',
  InReview: 'in_review',
  Responded: 'responded',
  Dismissed: 'dismissed',
  Removed: 'removed',
} as const;

export type PostStatusResponseDtoReviewStatusEnum =
  (typeof PostStatusResponseDtoReviewStatusEnum)[keyof typeof PostStatusResponseDtoReviewStatusEnum];
