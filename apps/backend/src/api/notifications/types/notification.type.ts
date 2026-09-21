import type { InAppNotificationType } from '@common/enums/in-app-notification-type.enum';

/** One `in_app_notifications` row, shaped for the feed — not the whole row. `isRead` is derived
 *  (`read_at !== null`) rather than exposing the timestamp itself; nothing downstream renders it. */
export interface NotificationRecord {
  id: string;
  type: InAppNotificationType;
  title: string;
  description: string | null;
  reviewId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ListNotificationsInput {
  tenantId: string;
  userId: string;
  offset: number;
  limit: number;
}

export interface MarkNotificationReadInput {
  tenantId: string;
  userId: string;
  notificationId: string;
}

/** What both mark-read routes answer with: the caller's unread count after the write, so the
 *  bell's badge is reconciled from the server rather than decremented on a guess. */
export interface NotificationReadResult {
  unreadTotal: number;
}

/** Matches the web app's own `NotificationPage` (`notification.service.ts`) exactly — see the
 *  API reference's corrected pagination contract for why this is offset/limit with an embedded
 *  `unreadTotal`, not this app's usual `page`/`pageSize`/`meta`. */
export interface NotificationsPage {
  items: NotificationRecord[];
  hasMore: boolean;
  unreadTotal: number;
}
