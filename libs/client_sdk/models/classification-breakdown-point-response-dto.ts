// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface ClassificationBreakdownPointResponseDto {
  classification: ClassificationBreakdownPointResponseDtoClassificationEnum;
  count: number;
}

export const ClassificationBreakdownPointResponseDtoClassificationEnum = {
  AutoReplyCandidate: 'auto_reply_candidate',
  Escalated: 'escalated',
  PendingClassification: 'pending_classification',
} as const;

export type ClassificationBreakdownPointResponseDtoClassificationEnum =
  (typeof ClassificationBreakdownPointResponseDtoClassificationEnum)[keyof typeof ClassificationBreakdownPointResponseDtoClassificationEnum];
