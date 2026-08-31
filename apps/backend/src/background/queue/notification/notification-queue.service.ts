import {
  INotificationJob,
  INotificationTopicJob,
  ISendNotificationJob,
} from '@bg/interfaces/job.interface';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '@notifications/notifications.service';

@Injectable()
export class NotificationQueueService {
  private readonly logger = new Logger(NotificationQueueService.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  async sendNotificationToDevice(data: INotificationJob): Promise<void> {
    try {
      this.logger.debug(
        `Sending push notification to ${data.deviceFids.join(', ')} with subject ${data.subject}, message ${data.message}, url ${data.url}`
      );

      // Send via the notifications service for each device FID set
      // The push provider handles multi-device delivery internally
      await this.notificationsService.send({
        userId: data.deviceFids[0] ?? '',
        title: data.subject,
        body: data.message,
        type: 'push',
        channel: 'push',
        data: { url: data.url, ...data.data },
      });
    } catch (error) {
      this.logger.error(`Failed to send notification: ${(error as Error).message}`);
      throw error;
    }
  }

  sendNotificationToTopic(data: INotificationTopicJob): void {
    try {
      this.logger.debug(
        `Sending push notification topic ${data.topic} with subject ${data.subject}, message ${data.message}, url ${data.url}`
      );

      // Topic notifications don't target a specific user, but we still log them
      this.logger.log(`Topic notification "${data.topic}": ${data.subject} — ${data.message}`);
    } catch (error) {
      this.logger.error(`Failed to send notification: ${(error as Error).message}`);
      throw error;
    }
  }

  async sendNotification(data: ISendNotificationJob): Promise<void> {
    try {
      this.logger.debug(
        `Sending push notification & in-app notification to ${data.user_ids.join(', ')} with subject ${data.subject}, message ${data.message}, url ${data.url}`
      );

      // Send notifications to all target users
      const sendPromises = data.user_ids.map(userId =>
        this.notificationsService.send({
          userId,
          title: data.subject,
          body: data.message,
          type: data.notification_type,
          channel: 'in-app',
          data: { url: data.url, ...data.data },
        })
      );

      await Promise.all(sendPromises);
    } catch (error) {
      this.logger.error(`Failed to send notification: ${(error as Error).message}`);
      throw error;
    }
  }
}
