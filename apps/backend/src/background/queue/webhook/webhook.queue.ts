import { JobName, QueueName } from '@bg/constants/job.constant';
import { IWebhookDeliveryJob } from '@bg/interfaces/job.interface';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class WebhookQueue {
  private readonly logger = new Logger(WebhookQueue.name);

  constructor(private readonly queuePublisher: QueuePublisherProvider) {}

  async addDeliveryJob(data: IWebhookDeliveryJob): Promise<void> {
    this.logger.debug(
      `Adding webhook delivery job for webhook ${data.webhookId}, event ${data.event}`
    );
    await this.queuePublisher.publish(QueueName.WEBHOOK, JobName.WEBHOOK_DELIVER, data, {
      attempts: 5,
      backoffDelayMs: 10_000, // 10s initial delay, then 20s, 40s, 80s, 160s
    });
  }
}
