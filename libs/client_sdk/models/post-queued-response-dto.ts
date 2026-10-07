// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface PostQueuedResponseDto {
  id: string;
  status: PostQueuedResponseDtoStatusEnum;
  postQueuedAt: string;
}

export const PostQueuedResponseDtoStatusEnum = {
  PendingApproval: 'pending_approval',
  Approved: 'approved',
  Rejected: 'rejected',
  Superseded: 'superseded',
} as const;

export type PostQueuedResponseDtoStatusEnum =
  (typeof PostQueuedResponseDtoStatusEnum)[keyof typeof PostQueuedResponseDtoStatusEnum];
