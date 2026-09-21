import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';

import type { ListNotificationsInput } from '../../../api/notifications/types/notification.type';

interface RawNotificationRow {
  id: string;
  type: string;
  title: string;
  description: string | null;
  reviewId: string | null;
  readAt: string | null;
  createdAt: string;
}

@Injectable()
export class NotificationsRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * One extra row beyond `limit` (`limit + 1`), not a separate `COUNT(*)` — the DB service uses
   * its presence to derive `hasMore` and drops it before returning, matching the offset/limit
   * contract `notification.service.ts` already implements on the frontend.
   */
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
   * Stamps one row read, scoped to the caller. `COALESCE(read_at, now())` rather than a plain
   * assignment plus a `read_at IS NULL` guard: re-marking an already-read notification has to stay
   * a success (the frontend fires this on every click, not only the first), but it must not move
   * the original timestamp. Returning the id lets the caller tell "yours, updated" from "not
   * yours or no such row", which is the 404.
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

  /** Every unread row in the caller's own feed. Already-read rows are left alone, so their
   *  original timestamps survive and the statement stays cheap on a mostly-read feed. */
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

  /** Unread across the caller's whole feed — recomputed on every call, not just the first page,
   *  since `unreadTotal` is embedded on every response the frontend reads. */
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
