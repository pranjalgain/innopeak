import type { InAppNotificationType } from '@common/enums/in-app-notification-type.enum';
import { Injectable } from '@nestjs/common';

import { NotificationsRepository } from './notifications.repository';

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

  async listPage(input: ListNotificationsInput): Promise<NotificationsPage> {
    const [rows, unreadTotal] = await Promise.all([
      // Over-fetches by one row (see the repository's own comment) purely to derive `hasMore`
      // without a second COUNT(*) query.
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

  /**
   * Marks one row read and reports the caller's remaining unread count, so the bell's badge can
   * be reconciled from the response instead of guessed at or refetched. Returns null when the row
   * isn't the caller's — the 404 the service raises.
   */
  async markRead(input: MarkNotificationReadInput): Promise<NotificationReadResult | null> {
    const updated = await this.notificationsRepository.markRead(input);
    if (!updated) {
      return null;
    }

    return {
      unreadTotal: await this.notificationsRepository.countUnread(input.tenantId, input.userId),
    };
  }

  /** Marks the caller's whole feed read. The count is read back rather than assumed to be zero:
   *  a row inserted between the update and the count is genuinely unread and belongs in the badge. */
  async markAllRead(tenantId: string, userId: string): Promise<NotificationReadResult> {
    await this.notificationsRepository.markAllRead(tenantId, userId);
    return { unreadTotal: await this.notificationsRepository.countUnread(tenantId, userId) };
  }
}
