// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface NotificationDto {
  id: string;
  type: NotificationDtoTypeEnum;
  title: string;
  description?: string | null;
  /**
   * Present when this notification links to a specific review.
   */
  reviewId?: string | null;
  isRead: boolean;
  createdAt: string;
}

export const NotificationDtoTypeEnum = {
  ReviewEscalated: 'review_escalated',
  ReplyNeedsApproval: 'reply_needs_approval',
  ReplyApproved: 'reply_approved',
  ConnectionIssue: 'connection_issue',
} as const;

export type NotificationDtoTypeEnum =
  (typeof NotificationDtoTypeEnum)[keyof typeof NotificationDtoTypeEnum];
