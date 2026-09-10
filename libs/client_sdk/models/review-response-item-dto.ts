// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface ReviewResponseItemDto {
  id: string;
  generationGroupId?: object | null;
  /**
   * Derived from position within generationGroupId, not a column. A null-group row gets \'A\'.
   */
  label: string;
  responseType: ReviewResponseItemDtoResponseTypeEnum;
  content: string;
  /**
   * Null for human_manual and imported rows, which never had an AI draft.
   */
  originalContent?: object | null;
  source: ReviewResponseItemDtoSourceEnum;
  /**
   * A projection onto the four values the client understands, not the raw seven-value response_status — see the module swagger for the mapping and why.
   */
  status: ReviewResponseItemDtoStatusEnum;
  createdByUserId?: object | null;
  approvedByUserId?: object | null;
  createdAt: string;
  decidedAt?: object | null;
  postedAt?: object | null;
  errorMessage?: object | null;
}

export const ReviewResponseItemDtoResponseTypeEnum = {
  AutoReplySuggestion: 'auto_reply_suggestion',
  EscalationSnippet: 'escalation_snippet',
  ImportedReply: 'imported_reply',
} as const;

export type ReviewResponseItemDtoResponseTypeEnum =
  (typeof ReviewResponseItemDtoResponseTypeEnum)[keyof typeof ReviewResponseItemDtoResponseTypeEnum];
export const ReviewResponseItemDtoSourceEnum = {
  AiGenerated: 'ai_generated',
  HumanEdited: 'human_edited',
  HumanManual: 'human_manual',
  Imported: 'imported',
} as const;

export type ReviewResponseItemDtoSourceEnum =
  (typeof ReviewResponseItemDtoSourceEnum)[keyof typeof ReviewResponseItemDtoSourceEnum];
export const ReviewResponseItemDtoStatusEnum = {
  PendingApproval: 'pending_approval',
  Approved: 'approved',
  Rejected: 'rejected',
  Superseded: 'superseded',
} as const;

export type ReviewResponseItemDtoStatusEnum =
  (typeof ReviewResponseItemDtoStatusEnum)[keyof typeof ReviewResponseItemDtoStatusEnum];
