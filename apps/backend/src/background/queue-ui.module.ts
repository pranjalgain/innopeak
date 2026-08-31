import { QueueTransportModule } from '@bg/providers/queue-transport.module';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { RouteNames } from '@common/route-names';
import { CronUIModule } from '@cron/cron-ui.module';
import { DeadLetterQueueUIModule } from '@dead-letter-queue/deadletter-queue-ui.module';
import { EmailQueueUIModule } from '@email-queue/email-queue-ui.module';
import { Module } from '@nestjs/common';
import { NotificationQueueUIModule } from '@notification-queue/notification-queue-ui.module';

import { WebhookQueueUIModule } from './queue/webhook/webhook-queue-ui.module';

@Module({
  imports: [
    QueueTransportModule,
    BullBoardModule.forRoot({
      route: RouteNames.QUEUES_UI,
      adapter: ExpressAdapter,
      boardOptions: {
        uiConfig: {
          boardTitle: 'Queues Monitoring',
        },
      },
    }),
    DeadLetterQueueUIModule,
    CronUIModule,
    NotificationQueueUIModule,
    EmailQueueUIModule,
    WebhookQueueUIModule,
  ],
  providers: [AddingJobsToQueueManager],
  exports: [AddingJobsToQueueManager],
})
export class QueueUIModule {}
