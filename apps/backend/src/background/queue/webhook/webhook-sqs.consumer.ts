import { JobName, QueueName } from '@bg/constants/job.constant';
import { IWebhookDeliveryJob } from '@bg/interfaces/job.interface';
import { SqsQueueConsumerBase } from '@bg/providers/sqs-queue-consumer.base';
import { EnvConfig } from '@config/env.config';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { WebhookQueueService } from './webhook-queue.service';

@Injectable()
export class WebhookSqsConsumer extends SqsQueueConsumerBase {
  protected readonly queueName = QueueName.WEBHOOK;
  protected readonly logger = new Logger(WebhookSqsConsumer.name);

  constructor(
    configService: ConfigService<EnvConfig>,
    private readonly webhookQueueService: WebhookQueueService,
    private readonly dlqService: DeadLetterQueueService
  ) {
    super(configService);
  }

  async process(jobName: string, data: unknown): Promise<void> {
    switch (jobName as JobName) {
      case JobName.WEBHOOK_DELIVER:
        await this.webhookQueueService.deliverWebhook(data as IWebhookDeliveryJob);
        break;
      default:
        throw new Error(`Unknown job name: ${jobName}`);
    }
  }

  protected override async onProcessingFailed(
    jobName: string,
    data: unknown,
    error: Error
  ): Promise<void> {
    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.WEBHOOK,
      originalJobId: '',
      originalJobName: jobName,
      originalJobData: data,
      failedReason: error.message,
      stacktrace: error.stack ? error.stack.split('\n') : [],
      timestamp: Date.now(),
    });
  }
}
