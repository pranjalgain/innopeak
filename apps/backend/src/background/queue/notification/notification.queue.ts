import { JobName, QueueName } from '@bg/constants/job.constant';
import {
  INotificationJob,
  INotificationTopicJob,
  ISendNotificationJob,
} from '@bg/interfaces/job.interface';
import { QueuePublisherProvider } from '@bg/providers/queue-publisher.provider';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationQueue {
  private readonly logger = new Logger(NotificationQueue.name);
  constructor(private readonly queuePublisher: QueuePublisherProvider) {}

  async addSendNotificationToDeviceJob(data: INotificationJob): Promise<void> {
    this.logger.debug(
      `Sending notification job for ${data.deviceFids.join(', ')}, subject ${data.subject}, message ${data.message}, url ${data.url}, additional data ${JSON.stringify(data.data)}`
    );
    await this.queuePublisher.publish(QueueName.NOTIFICATION, JobName.NOTIFICATION_TO_DEVICE, data);
  }

  async addSendNotificationToTopicJob(data: INotificationTopicJob): Promise<void> {
    this.logger.debug(
      `Sending notification job for ${data.topic}, subject ${data.subject}, message ${data.message}, url ${data.url}, additional data ${JSON.stringify(data.data)}`
    );
    await this.queuePublisher.publish(QueueName.NOTIFICATION, JobName.NOTIFICATION_TO_TOPIC, data);
  }

  async addSendNotificationJob(data: ISendNotificationJob): Promise<void> {
    this.logger.debug(
      `Sending notification job for ${data.user_ids.join(', ')}, subject ${data.subject}, message ${data.message}, url ${data.url}`
    );
    await this.queuePublisher.publish(QueueName.NOTIFICATION, JobName.NOTIFICATION_SEND, data);
  }
}
