// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface RetryPostResponseDto {
  id: string;
  status: RetryPostResponseDtoStatusEnum;
  errorMessage?: object | null;
  retryQueuedAt: string;
}

export const RetryPostResponseDtoStatusEnum = {
  PendingApproval: 'pending_approval',
  Approved: 'approved',
  Rejected: 'rejected',
  Superseded: 'superseded',
} as const;

export type RetryPostResponseDtoStatusEnum =
  (typeof RetryPostResponseDtoStatusEnum)[keyof typeof RetryPostResponseDtoStatusEnum];
