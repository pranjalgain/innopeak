// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { NotificationDto } from './notification-dto';

export interface NotificationListResponseDto {
  items: Array<NotificationDto>;
  /**
   * Whether a further call with offset + limit would return more rows.
   */
  hasMore: boolean;
  /**
   * Unread count across the whole feed, not just this page.
   */
  unreadTotal: number;
}
