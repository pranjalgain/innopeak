import { IWebhookDeliveryJob } from '@bg/interfaces/job.interface';
import { WebhooksRepository } from '@db/repositories/webhooks/webhooks.repository';
import { Injectable, Logger } from '@nestjs/common';

import { createHmac } from 'crypto';

@Injectable()
export class WebhookQueueService {
  private readonly logger = new Logger(WebhookQueueService.name);

  constructor(private readonly webhooksRepository: WebhooksRepository) {}

  async deliverWebhook(data: IWebhookDeliveryJob): Promise<{ statusCode: number; body: string }> {
    const { deliveryId, url, secret, event, payload } = data;
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = this.generateSignature(body, secret, timestamp);

    this.logger.debug(`Delivering webhook ${deliveryId} to ${url} for event ${event}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30_000); // 30s timeout

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': timestamp,
          'X-Webhook-Delivery': deliveryId,
          'User-Agent': 'NestJS-Webhook/1.0',
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseBody = await response.text();
      const statusCode = response.status;

      // Update delivery record
      if (statusCode >= 200 && statusCode < 300) {
        await this.webhooksRepository.updateDeliveryStatus(deliveryId, {
          status: 'delivered',
          responseStatus: statusCode,
          responseBody: responseBody.substring(0, 2000), // Truncate response body
          deliveredAt: new Date(),
          nextRetryAt: null,
        });
      } else {
        await this.webhooksRepository.updateDeliveryStatus(deliveryId, {
          status: 'failed',
          responseStatus: statusCode,
          responseBody: responseBody.substring(0, 2000),
        });

        throw new Error(`Webhook delivery failed with status ${statusCode}`);
      }

      return { statusCode, body: responseBody };
    } catch (error) {
      clearTimeout(timeoutId);

      if ((error as Error).name === 'AbortError') {
        await this.webhooksRepository.updateDeliveryStatus(deliveryId, {
          status: 'failed',
          responseBody: 'Request timed out after 30 seconds',
        });
        throw new Error('Webhook delivery timed out');
      }

      // Re-throw if it's our own error (status code failure)
      if ((error as Error).message.startsWith('Webhook delivery failed')) {
        throw error;
      }

      // Network or other errors
      await this.webhooksRepository.updateDeliveryStatus(deliveryId, {
        status: 'failed',
        responseBody: (error as Error).message.substring(0, 2000),
      });

      throw error;
    }
  }

  private generateSignature(body: string, secret: string, timestamp: string): string {
    const signaturePayload = `${timestamp}.${body}`;
    return `sha256=${createHmac('sha256', secret).update(signaturePayload).digest('hex')}`;
  }
}
