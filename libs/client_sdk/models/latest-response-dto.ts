// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface LatestResponseDto {
  id: string;
  status: LatestResponseDtoStatusEnum;
  responseType: LatestResponseDtoResponseTypeEnum;
  source: LatestResponseDtoSourceEnum;
  createdAt: string;
}

export const LatestResponseDtoStatusEnum = {
  PendingApproval: 'pending_approval',
  Approved: 'approved',
  Rejected: 'rejected',
  Superseded: 'superseded',
} as const;

export type LatestResponseDtoStatusEnum =
  (typeof LatestResponseDtoStatusEnum)[keyof typeof LatestResponseDtoStatusEnum];
export const LatestResponseDtoResponseTypeEnum = {
  AutoReplySuggestion: 'auto_reply_suggestion',
  EscalationSnippet: 'escalation_snippet',
  ImportedReply: 'imported_reply',
} as const;

export type LatestResponseDtoResponseTypeEnum =
  (typeof LatestResponseDtoResponseTypeEnum)[keyof typeof LatestResponseDtoResponseTypeEnum];
export const LatestResponseDtoSourceEnum = {
  AiGenerated: 'ai_generated',
  HumanEdited: 'human_edited',
  HumanManual: 'human_manual',
  Imported: 'imported',
} as const;

export type LatestResponseDtoSourceEnum =
  (typeof LatestResponseDtoSourceEnum)[keyof typeof LatestResponseDtoSourceEnum];
