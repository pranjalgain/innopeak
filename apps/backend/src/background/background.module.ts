import { QueueTransportModule } from '@bg/providers/queue-transport.module';
import { CronModule } from '@cron/cron.module';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { EmailQueueModule } from '@email-queue/email-queue.module';
import { Module } from '@nestjs/common';
import { ReviewSyncQueueModule } from '@review-sync-queue/review-sync-queue.module';

@Module({
  imports: [
    QueueTransportModule,
    EmailQueueModule,
    DeadLetterQueueModule,
    CronModule,
    ReviewSyncQueueModule,
  ],
})
export class BackgroundModule {}
