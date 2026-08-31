import { QueueTransportModule } from '@bg/providers/queue-transport.module';
import { CronModule } from '@cron/cron.module';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { EmailQueueModule } from '@email-queue/email-queue.module';
import { Module } from '@nestjs/common';
import { NotificationQueueModule } from '@notification-queue/notification-queue.module';

import { WebhookQueueModule } from './queue/webhook/webhook-queue.module';

@Module({
  imports: [
    QueueTransportModule,
    EmailQueueModule,
    NotificationQueueModule,
    WebhookQueueModule,
    DeadLetterQueueModule,
    CronModule,
  ],
})
export class BackgroundModule {}
