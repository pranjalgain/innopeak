import type { InAppNotificationType } from '@common/enums/in-app-notification-type.enum';

/** `isRead` is derived from `read_at`; the timestamp itself is not exposed. */
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

export interface NotificationReadResult {
  unreadTotal: number;
}

/** Mirrors the web `NotificationPage`: offset/limit with an embedded `unreadTotal`, not the usual page/pageSize/meta. */
export interface NotificationsPage {
  items: NotificationRecord[];
  hasMore: boolean;
  unreadTotal: number;
}
