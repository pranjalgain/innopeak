// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface ManualReplyResponseDto {
  id: string;
  reviewId: string;
  responseType: ManualReplyResponseDtoResponseTypeEnum;
  content: string;
  source: ManualReplyResponseDtoSourceEnum;
  status: ManualReplyResponseDtoStatusEnum;
  createdByUserId?: object | null;
  approvedByUserId?: object | null;
  decidedAt?: object | null;
  /**
   * Non-terminal siblings this manual reply superseded, in the same transaction.
   */
  supersededResponseIds: Array<string>;
  reviewStatus: ManualReplyResponseDtoReviewStatusEnum;
}

export const ManualReplyResponseDtoResponseTypeEnum = {
  AutoReplySuggestion: 'auto_reply_suggestion',
  EscalationSnippet: 'escalation_snippet',
  ImportedReply: 'imported_reply',
} as const;

export type ManualReplyResponseDtoResponseTypeEnum =
  (typeof ManualReplyResponseDtoResponseTypeEnum)[keyof typeof ManualReplyResponseDtoResponseTypeEnum];
export const ManualReplyResponseDtoSourceEnum = {
  AiGenerated: 'ai_generated',
  HumanEdited: 'human_edited',
  HumanManual: 'human_manual',
  Imported: 'imported',
} as const;

export type ManualReplyResponseDtoSourceEnum =
  (typeof ManualReplyResponseDtoSourceEnum)[keyof typeof ManualReplyResponseDtoSourceEnum];
export const ManualReplyResponseDtoStatusEnum = {
  PendingApproval: 'pending_approval',
  Approved: 'approved',
  Rejected: 'rejected',
  Superseded: 'superseded',
} as const;

export type ManualReplyResponseDtoStatusEnum =
  (typeof ManualReplyResponseDtoStatusEnum)[keyof typeof ManualReplyResponseDtoStatusEnum];
export const ManualReplyResponseDtoReviewStatusEnum = {
  New: 'new',
  InReview: 'in_review',
  Responded: 'responded',
  Dismissed: 'dismissed',
  Removed: 'removed',
} as const;

export type ManualReplyResponseDtoReviewStatusEnum =
  (typeof ManualReplyResponseDtoReviewStatusEnum)[keyof typeof ManualReplyResponseDtoReviewStatusEnum];
