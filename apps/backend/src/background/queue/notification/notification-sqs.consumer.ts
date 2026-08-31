import { JobName, QueueName } from '@bg/constants/job.constant';
import {
  INotificationJob,
  INotificationTopicJob,
  ISendNotificationJob,
} from '@bg/interfaces/job.interface';
import { SqsQueueConsumerBase } from '@bg/providers/sqs-queue-consumer.base';
import { EnvConfig } from '@config/env.config';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationQueueService } from '@notification-queue/notification-queue.service';

@Injectable()
export class NotificationSqsConsumer extends SqsQueueConsumerBase {
  protected readonly queueName = QueueName.NOTIFICATION;
  protected readonly logger = new Logger(NotificationSqsConsumer.name);

  constructor(
    configService: ConfigService<EnvConfig>,
    private readonly notificationQueueService: NotificationQueueService,
    private readonly dlqService: DeadLetterQueueService
  ) {
    super(configService);
  }

  async process(jobName: string, data: unknown): Promise<void> {
    switch (jobName as JobName) {
      case JobName.NOTIFICATION_TO_DEVICE:
        await this.notificationQueueService.sendNotificationToDevice(data as INotificationJob);
        break;
      case JobName.NOTIFICATION_TO_TOPIC:
        this.notificationQueueService.sendNotificationToTopic(data as INotificationTopicJob);
        break;
      case JobName.NOTIFICATION_SEND:
        await this.notificationQueueService.sendNotification(data as ISendNotificationJob);
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
      originalQueueName: QueueName.NOTIFICATION,
      originalJobId: '',
      originalJobName: jobName,
      originalJobData: data,
      failedReason: error.message,
      stacktrace: error.stack ? error.stack.split('\n') : [],
      timestamp: Date.now(),
    });
  }
}
