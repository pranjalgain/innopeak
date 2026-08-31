import { DBService } from '@db/db.service';
import { deviceTokens, notifications } from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import {
  NotificationRecord,
  SendNotificationOptions,
} from '@notifications/interfaces/notification.interface';
import { and, count, desc, eq, sql } from 'drizzle-orm';

interface DeviceFidRecord {
  id: string;
  userId: string;
  fid: string;
  platform: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class NotificationsRepository {
  constructor(private readonly dbService: DBService) {}

  async create(data: SendNotificationOptions): Promise<NotificationRecord> {
    const [row] = await this.dbService.db
      .insert(notifications)
      .values({
        userId: data.userId,
        title: data.title,
        body: data.body,
        type: data.type,
        channel: data.channel,
        data: data.data ?? {},
        sentAt: sql`now()`,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to create notification record');
    }

    return this.mapToNotificationRecord(row);
  }

  async findByUserId(
    userId: string,
    page: number,
    pageSize: number
  ): Promise<{ data: NotificationRecord[]; total: number }> {
    const offset = (page - 1) * pageSize;

    const [totalResult, rows] = await Promise.all([
      this.dbService.db
        .select({ count: count() })
        .from(notifications)
        .where(eq(notifications.userId, userId)),
      this.dbService.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data: rows.map(row => this.mapToNotificationRecord(row)),
      total,
    };
  }

  async findById(id: string): Promise<NotificationRecord | null> {
    const [row] = await this.dbService.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id));

    if (!row) {
      return null;
    }

    return this.mapToNotificationRecord(row);
  }

  async markAsRead(id: string, userId: string): Promise<NotificationRecord | null> {
    const [row] = await this.dbService.db
      .update(notifications)
      .set({
        isRead: true,
        readAt: sql`now()`,
      })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();

    if (!row) {
      return null;
    }

    return this.mapToNotificationRecord(row);
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.dbService.db
      .update(notifications)
      .set({
        isRead: true,
        readAt: sql`now()`,
      })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .returning({ id: notifications.id });

    return result.length;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const [result] = await this.dbService.db
      .select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    return result?.count ?? 0;
  }

  async findDeviceFids(userId: string): Promise<DeviceFidRecord[]> {
    const rows = await this.dbService.db
      .select()
      .from(deviceTokens)
      .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.isActive, true)));

    return rows;
  }

  async registerDeviceFid(
    userId: string,
    fid: string,
    platform: 'android' | 'ios' | 'web'
  ): Promise<DeviceFidRecord> {
    const [row] = await this.dbService.db
      .insert(deviceTokens)
      .values({
        userId,
        fid,
        platform,
      })
      .onConflictDoUpdate({
        target: deviceTokens.fid,
        set: {
          userId,
          platform,
          isActive: true,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    if (!row) {
      throw new Error('Failed to register device FID');
    }

    return row;
  }

  async deactivateDeviceFid(fid: string): Promise<void> {
    await this.dbService.db
      .update(deviceTokens)
      .set({
        isActive: false,
        updatedAt: sql`now()`,
      })
      .where(eq(deviceTokens.fid, fid));
  }

  private mapToNotificationRecord(row: {
    id: string;
    userId: string;
    title: string;
    body: string;
    type: string;
    data: unknown;
    channel: string;
    isRead: boolean;
    sentAt: Date | null;
    readAt: Date | null;
    createdAt: Date;
  }): NotificationRecord {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      body: row.body,
      type: row.type,
      data: row.data,
      channel: row.channel,
      isRead: row.isRead,
      sentAt: row.sentAt,
      readAt: row.readAt,
      createdAt: row.createdAt,
    };
  }
}
