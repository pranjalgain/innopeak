import { UserStatus } from '@auth/enums/user-status.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';

import type {
  InsertedNotification,
  InsertInAppNotificationInput,
  NotificationRecipientUser,
  RawNotificationRow,
} from './types/notifications.type';

import type { ListNotificationsInput } from '../../../api/notifications/types/notification.type';

/** Rows per statement, so a tenant-wide notice for a large tenant stays well under Postgres's bind-parameter limit. */
const INSERT_CHUNK_SIZE = 500;

/** Rows per DELETE in the retention purge, so a large backlog is many short transactions rather than one long one. */
const PURGE_BATCH_SIZE = 5_000;

@Injectable()
export class NotificationsRepository {
  constructor(private readonly dbService: DBService) {}

  /** Everyone in the tenant who can see the bell: active, not anonymized, and not scheduled for erasure. */
  async listActiveRecipients(tenantId: string): Promise<NotificationRecipientUser[]> {
    return this.dbService.db
      .select({ id: schema.users.id, locale: schema.users.locale })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.tenantId, tenantId),
          eq(schema.users.status, UserStatus.ACTIVE),
          isNull(schema.users.anonymizedAt),
          isNull(schema.users.erasureRequestedAt)
        )
      );
  }

  /**
   * `ON CONFLICT DO NOTHING` against `idx_in_app_notifications_dedupe`, so repeating a notice that has a review and a generation group
   * is a no-op. Only rows with BOTH are protected: a NULL in either never conflicts (NULLs are distinct), so the other notice types
   * are at-least-once and rely on the producers to call once per event. All chunks go in one transaction: a failure part way writes
   * nothing, so users are never left with half a tenant-wide notice, and the caller never publishes for rows that were not kept.
   * Returns the rows actually written (their ids tell the real-time feed who has something new).
   */
  async insertMany(rows: InsertInAppNotificationInput[]): Promise<InsertedNotification[]> {
    if (rows.length === 0) {
      return [];
    }

    return this.dbService.db.transaction(async tx => {
      const written: InsertedNotification[] = [];
      for (let start = 0; start < rows.length; start += INSERT_CHUNK_SIZE) {
        const inserted = await tx
          .insert(schema.inAppNotifications)
          .values(
            rows.slice(start, start + INSERT_CHUNK_SIZE).map(row => ({
              tenantId: row.tenantId,
              userId: row.userId,
              type: row.type as (typeof schema.inAppNotifications.$inferInsert)['type'],
              title: row.title,
              description: row.description,
              reviewId: row.reviewId,
              generationGroupId: row.generationGroupId,
            }))
          )
          .onConflictDoNothing()
          .returning({
            id: schema.inAppNotifications.id,
            userId: schema.inAppNotifications.userId,
          });
        written.push(...inserted);
      }
      return written;
    });
  }

  /**
   * Read entries past `readRetentionDays`, and any entry (read or not) past `unreadRetentionDays`. Returns the rows deleted. Deleted in
   * batches (each its own short transaction, served by the age indexes), so the first run on a big table, or one after a missed night,
   * does not hold a long lock or write one huge burst of WAL.
   */
  async purgeOld(input: {
    readRetentionDays: number;
    unreadRetentionDays: number;
    batchSize?: number;
  }): Promise<number> {
    const batchSize = input.batchSize ?? PURGE_BATCH_SIZE;
    const expired = or(
      and(
        isNotNull(schema.inAppNotifications.readAt),
        lt(
          schema.inAppNotifications.readAt,
          sql`now() - make_interval(days => ${input.readRetentionDays})`
        )
      ),
      lt(
        schema.inAppNotifications.createdAt,
        sql`now() - make_interval(days => ${input.unreadRetentionDays})`
      )
    );

    let total = 0;
    for (;;) {
      const deleted = await this.dbService.db
        .delete(schema.inAppNotifications)
        .where(
          inArray(
            schema.inAppNotifications.id,
            this.dbService.db
              .select({ id: schema.inAppNotifications.id })
              .from(schema.inAppNotifications)
              .where(expired)
              .limit(batchSize)
          )
        )
        .returning({ id: schema.inAppNotifications.id });

      total += deleted.length;
      if (deleted.length < batchSize) {
        return total;
      }
    }
  }

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
