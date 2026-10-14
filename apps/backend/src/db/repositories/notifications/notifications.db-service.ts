import type { InAppNotificationType } from '@common/enums/in-app-notification-type.enum';
import { Injectable } from '@nestjs/common';

import { NotificationsRepository } from './notifications.repository';
import type {
  InsertedNotification,
  InsertInAppNotificationInput,
  NotificationRecipientUser,
} from './types/notifications.type';

import type {
  ListNotificationsInput,
  MarkNotificationReadInput,
  NotificationReadResult,
  NotificationRecord,
  NotificationsPage,
} from '../../../api/notifications/types/notification.type';

@Injectable()
export class NotificationsDbService {
  constructor(private readonly notificationsRepository: NotificationsRepository) {}

  listActiveRecipients(tenantId: string): Promise<NotificationRecipientUser[]> {
    return this.notificationsRepository.listActiveRecipients(tenantId);
  }

  purgeOld(input: { readRetentionDays: number; unreadRetentionDays: number }): Promise<number> {
    return this.notificationsRepository.purgeOld(input);
  }

  /** One transaction, in chunks inside the repository: all or nothing. */
  insertMany(rows: InsertInAppNotificationInput[]): Promise<InsertedNotification[]> {
    return this.notificationsRepository.insertMany(rows);
  }

  async listPage(input: ListNotificationsInput): Promise<NotificationsPage> {
    const [rows, unreadTotal] = await Promise.all([
      // Over-fetches by one row to derive `hasMore` without a second COUNT(*).
      this.notificationsRepository.listPage(input),
      this.notificationsRepository.countUnread(input.tenantId, input.userId),
    ]);

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;

    const items: NotificationRecord[] = page.map(row => ({
      id: row.id,
      type: row.type as InAppNotificationType,
      title: row.title,
      description: row.description,
      reviewId: row.reviewId,
      isRead: row.readAt !== null,
      createdAt: row.createdAt,
    }));

    return { items, hasMore, unreadTotal };
  }

  /** Returns null when the row isn't the caller's (the service raises 404). */
  async markRead(input: MarkNotificationReadInput): Promise<NotificationReadResult | null> {
    const updated = await this.notificationsRepository.markRead(input);
    if (!updated) {
      return null;
    }

    return {
      unreadTotal: await this.notificationsRepository.countUnread(input.tenantId, input.userId),
    };
  }

  /** The count is read back rather than assumed zero: a row inserted meanwhile is genuinely unread. */
  async markAllRead(tenantId: string, userId: string): Promise<NotificationReadResult> {
    await this.notificationsRepository.markAllRead(tenantId, userId);
    return { unreadTotal: await this.notificationsRepository.countUnread(tenantId, userId) };
  }
}
