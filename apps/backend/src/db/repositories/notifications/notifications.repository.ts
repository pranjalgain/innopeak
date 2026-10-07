import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';

import type { RawNotificationRow } from './types/notifications.type';

import type { ListNotificationsInput } from '../../../api/notifications/types/notification.type';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly dbService: DBService) {}

  /** Fetches `limit + 1` rows; the DB service uses the extra one to derive `hasMore` and drops it. */
  async listPage(input: ListNotificationsInput): Promise<RawNotificationRow[]> {
    const { tenantId, userId, offset, limit } = input;

    return this.dbService.db
      .select({
        id: schema.inAppNotifications.id,
        type: schema.inAppNotifications.type,
        title: schema.inAppNotifications.title,
        description: schema.inAppNotifications.description,
        reviewId: schema.inAppNotifications.reviewId,
        readAt: schema.inAppNotifications.readAt,
        createdAt: schema.inAppNotifications.createdAt,
      })
      .from(schema.inAppNotifications)
      .where(
        and(
          eq(schema.inAppNotifications.tenantId, tenantId),
          eq(schema.inAppNotifications.userId, userId)
        )
      )
      .orderBy(desc(schema.inAppNotifications.createdAt), desc(schema.inAppNotifications.id))
      .limit(limit + 1)
      .offset(offset);
  }

  /**
   * `COALESCE(read_at, now())` rather than a `read_at IS NULL` guard: re-marking a read row must
   * still succeed (the frontend fires on every click) without moving the original timestamp. A
   * false result means not the caller's row or no such row.
   */
  async markRead(input: {
    tenantId: string;
    userId: string;
    notificationId: string;
  }): Promise<boolean> {
    const rows = await this.dbService.db
      .update(schema.inAppNotifications)
      .set({
        readAt: sql`COALESCE(${schema.inAppNotifications.readAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(schema.inAppNotifications.id, input.notificationId),
          eq(schema.inAppNotifications.tenantId, input.tenantId),
          eq(schema.inAppNotifications.userId, input.userId)
        )
      )
      .returning({ id: schema.inAppNotifications.id });

    return rows.length > 0;
  }

  /** Only unread rows are touched, so original read timestamps survive. */
  async markAllRead(tenantId: string, userId: string): Promise<void> {
    await this.dbService.db
      .update(schema.inAppNotifications)
      .set({ readAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(schema.inAppNotifications.tenantId, tenantId),
          eq(schema.inAppNotifications.userId, userId),
          isNull(schema.inAppNotifications.readAt)
        )
      );
  }

  /** Counts the whole feed, not just the current page. */
  async countUnread(tenantId: string, userId: string): Promise<number> {
    const rows = await this.dbService.db
      .select({ value: count() })
      .from(schema.inAppNotifications)
      .where(
        and(
          eq(schema.inAppNotifications.tenantId, tenantId),
          eq(schema.inAppNotifications.userId, userId),
          isNull(schema.inAppNotifications.readAt)
        )
      );

    return rows[0]?.value ?? 0;
  }
}
