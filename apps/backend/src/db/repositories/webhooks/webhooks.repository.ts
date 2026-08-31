import { DBService } from '@db/db.service';
import { webhookDeliveries, webhooks } from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import {
  CreateDeliveryData,
  CreateWebhookData,
  UpdateDeliveryData,
  UpdateWebhookData,
  WebhookDeliveryRecord,
  WebhookRecord,
} from '../../../webhooks/interfaces/webhook.interface';

@Injectable()
export class WebhooksRepository {
  constructor(private readonly dbService: DBService) {}

  async createWebhook(data: CreateWebhookData): Promise<WebhookRecord> {
    const values: Record<string, unknown> = {
      userId: data.userId,
      url: data.url,
      secret: data.secret,
      events: data.events,
    };

    if (data.description !== undefined) {
      values['description'] = data.description;
    }

    const [row] = await this.dbService.db
      .insert(webhooks)
      .values(values as typeof webhooks.$inferInsert)
      .returning();

    if (!row) {
      throw new Error('Failed to create webhook');
    }

    return this.mapToWebhookRecord(row);
  }

  async findByUserId(userId: string): Promise<WebhookRecord[]> {
    const rows = await this.dbService.db
      .select()
      .from(webhooks)
      .where(eq(webhooks.userId, userId))
      .orderBy(desc(webhooks.createdAt));

    return rows.map(row => this.mapToWebhookRecord(row));
  }

  async findById(id: string): Promise<WebhookRecord | null> {
    const [row] = await this.dbService.db.select().from(webhooks).where(eq(webhooks.id, id));

    if (!row) {
      return null;
    }

    return this.mapToWebhookRecord(row);
  }

  async findByEvent(event: string): Promise<WebhookRecord[]> {
    const rows = await this.dbService.db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.isActive, true), sql`${event} = ANY(${webhooks.events})`));

    return rows.map(row => this.mapToWebhookRecord(row));
  }

  async updateWebhook(
    id: string,
    userId: string,
    data: UpdateWebhookData
  ): Promise<WebhookRecord | null> {
    const setValues: Record<string, unknown> = {
      updatedAt: sql`now()`,
    };

    if (data.url !== undefined) {
      setValues['url'] = data.url;
    }
    if (data.events !== undefined) {
      setValues['events'] = data.events;
    }
    if (data.isActive !== undefined) {
      setValues['isActive'] = data.isActive;
    }
    if (data.description !== undefined) {
      setValues['description'] = data.description;
    }

    const [row] = await this.dbService.db
      .update(webhooks)
      .set(setValues as Partial<typeof webhooks.$inferInsert>)
      .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)))
      .returning();

    if (!row) {
      return null;
    }

    return this.mapToWebhookRecord(row);
  }

  async deleteWebhook(id: string, userId: string): Promise<boolean> {
    const result = await this.dbService.db
      .delete(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)))
      .returning({ id: webhooks.id });

    return result.length > 0;
  }

  async createDelivery(data: CreateDeliveryData): Promise<WebhookDeliveryRecord> {
    const [row] = await this.dbService.db
      .insert(webhookDeliveries)
      .values({
        webhookId: data.webhookId,
        event: data.event,
        payload: data.payload,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to create webhook delivery');
    }

    return this.mapToDeliveryRecord(row);
  }

  async updateDeliveryStatus(
    id: string,
    data: UpdateDeliveryData
  ): Promise<WebhookDeliveryRecord | null> {
    const setValues: Record<string, unknown> = {
      status: data.status,
    };

    if (data.responseStatus !== undefined) {
      setValues['responseStatus'] = data.responseStatus;
    }
    if (data.responseBody !== undefined) {
      setValues['responseBody'] = data.responseBody;
    }
    if (data.attempt !== undefined) {
      setValues['attempt'] = data.attempt;
    }
    if (data.deliveredAt !== undefined) {
      setValues['deliveredAt'] = data.deliveredAt;
    }
    if (data.nextRetryAt !== undefined) {
      setValues['nextRetryAt'] = data.nextRetryAt;
    }

    const [row] = await this.dbService.db
      .update(webhookDeliveries)
      .set(setValues as Partial<typeof webhookDeliveries.$inferInsert>)
      .where(eq(webhookDeliveries.id, id))
      .returning();

    if (!row) {
      return null;
    }

    return this.mapToDeliveryRecord(row);
  }

  async findDeliveriesByWebhookId(
    webhookId: string,
    page: number,
    pageSize: number
  ): Promise<{ data: WebhookDeliveryRecord[]; total: number }> {
    const offset = (page - 1) * pageSize;

    const [countResult, rows] = await Promise.all([
      this.dbService.db
        .select({ count: sql<number>`count(*)::int` })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhookId, webhookId)),
      this.dbService.db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.webhookId, webhookId))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = countResult[0]?.count ?? 0;

    return {
      data: rows.map(row => this.mapToDeliveryRecord(row)),
      total,
    };
  }

  private mapToWebhookRecord(row: {
    id: string;
    userId: string;
    url: string;
    secret: string;
    events: string[] | null;
    isActive: boolean;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): WebhookRecord {
    return {
      id: row.id,
      userId: row.userId,
      url: row.url,
      secret: row.secret,
      events: row.events ?? [],
      isActive: row.isActive,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapToDeliveryRecord(row: {
    id: string;
    webhookId: string;
    event: string;
    payload: unknown;
    responseStatus: number | null;
    responseBody: string | null;
    attempt: number;
    deliveredAt: Date | null;
    nextRetryAt: Date | null;
    status: string;
    createdAt: Date;
  }): WebhookDeliveryRecord {
    return {
      id: row.id,
      webhookId: row.webhookId,
      event: row.event,
      payload: row.payload,
      responseStatus: row.responseStatus,
      responseBody: row.responseBody,
      attempt: row.attempt,
      deliveredAt: row.deliveredAt,
      nextRetryAt: row.nextRetryAt,
      status: row.status,
      createdAt: row.createdAt,
    };
  }
}
