import { WebhooksRepository } from '@db/repositories/webhooks/webhooks.repository';
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { createHmac, randomBytes } from 'crypto';

import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhookDeliveryRecord, WebhookRecord } from './interfaces/webhook.interface';

import { WebhookQueue } from '../background/queue/webhook/webhook.queue';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly webhooksRepository: WebhooksRepository,
    private readonly webhookQueue: WebhookQueue
  ) {}

  async create(userId: string, dto: CreateWebhookDto): Promise<WebhookRecord> {
    const secret = this.generateSecret();

    const data: Parameters<WebhooksRepository['createWebhook']>[0] = {
      userId,
      url: dto.url,
      secret,
      events: dto.events,
    };

    if (dto.description !== undefined) {
      data.description = dto.description;
    }

    return this.webhooksRepository.createWebhook(data);
  }

  async findAllByUser(userId: string): Promise<WebhookRecord[]> {
    return this.webhooksRepository.findByUserId(userId);
  }

  async findOne(id: string, userId: string): Promise<WebhookRecord> {
    const webhook = await this.webhooksRepository.findById(id);

    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }

    if (webhook.userId !== userId) {
      throw new ForbiddenException('You do not have access to this webhook');
    }

    return webhook;
  }

  async update(id: string, userId: string, dto: UpdateWebhookDto): Promise<WebhookRecord> {
    // Verify ownership first
    await this.findOne(id, userId);

    const updateData: Parameters<WebhooksRepository['updateWebhook']>[2] = {};

    if (dto.url !== undefined) {
      updateData.url = dto.url;
    }
    if (dto.events !== undefined) {
      updateData.events = dto.events;
    }
    if (dto.isActive !== undefined) {
      updateData.isActive = dto.isActive;
    }
    if (dto.description !== undefined) {
      updateData.description = dto.description;
    }

    const updated = await this.webhooksRepository.updateWebhook(id, userId, updateData);

    if (!updated) {
      throw new NotFoundException('Webhook not found');
    }

    return updated;
  }

  async remove(id: string, userId: string): Promise<void> {
    // Verify ownership first
    await this.findOne(id, userId);

    const deleted = await this.webhooksRepository.deleteWebhook(id, userId);

    if (!deleted) {
      throw new NotFoundException('Webhook not found');
    }
  }

  async getDeliveries(
    webhookId: string,
    userId: string,
    page: number,
    pageSize: number
  ): Promise<{ data: WebhookDeliveryRecord[]; total: number }> {
    // Verify ownership first
    await this.findOne(webhookId, userId);

    return this.webhooksRepository.findDeliveriesByWebhookId(webhookId, page, pageSize);
  }

  /**
   * Dispatch an event to all subscribed webhooks.
   * This is the main entry point for triggering outbound webhook deliveries.
   */
  async dispatch(event: string, payload: Record<string, unknown>): Promise<void> {
    const subscribedWebhooks = await this.webhooksRepository.findByEvent(event);

    if (subscribedWebhooks.length === 0) {
      this.logger.debug(`No webhooks subscribed to event: ${event}`);
      return;
    }

    this.logger.debug(`Dispatching event "${event}" to ${subscribedWebhooks.length} webhook(s)`);

    const deliveryPromises = subscribedWebhooks.map(async webhook => {
      try {
        // Create delivery record
        const delivery = await this.webhooksRepository.createDelivery({
          webhookId: webhook.id,
          event,
          payload,
        });

        // Queue the delivery job
        await this.webhookQueue.addDeliveryJob({
          webhookId: webhook.id,
          deliveryId: delivery.id,
          url: webhook.url,
          secret: webhook.secret,
          event,
          payload,
        });
      } catch (error) {
        this.logger.error(
          `Failed to queue webhook delivery for webhook ${webhook.id}: ${(error as Error).message}`
        );
      }
    });

    await Promise.allSettled(deliveryPromises);
  }

  /**
   * Send a test event to verify a webhook endpoint is working.
   */
  async sendTestEvent(id: string, userId: string): Promise<WebhookDeliveryRecord> {
    const webhook = await this.findOne(id, userId);

    const testPayload: Record<string, unknown> = {
      event: 'webhook.test',
      message: 'This is a test webhook delivery',
      timestamp: new Date().toISOString(),
      webhookId: webhook.id,
    };

    const delivery = await this.webhooksRepository.createDelivery({
      webhookId: webhook.id,
      event: 'webhook.test',
      payload: testPayload,
    });

    await this.webhookQueue.addDeliveryJob({
      webhookId: webhook.id,
      deliveryId: delivery.id,
      url: webhook.url,
      secret: webhook.secret,
      event: 'webhook.test',
      payload: testPayload,
    });

    return delivery;
  }

  /**
   * Generate an HMAC-SHA256 signature for a webhook payload.
   * Used for verifying webhook authenticity on the receiving end.
   */
  generateSignature(payload: string, secret: string, timestamp: string): string {
    const signaturePayload = `${timestamp}.${payload}`;
    return `sha256=${createHmac('sha256', secret).update(signaturePayload).digest('hex')}`;
  }

  /**
   * Generate a cryptographically secure random secret for webhook signing.
   */
  private generateSecret(): string {
    return `whsec_${randomBytes(32).toString('hex')}`;
  }
}
