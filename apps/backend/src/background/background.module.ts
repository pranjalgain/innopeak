import { QueueTransportModule } from '@bg/providers/queue-transport.module';
import { CronModule } from '@cron/cron.module';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { EmailQueueModule } from '@email-queue/email-queue.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [QueueTransportModule, EmailQueueModule, DeadLetterQueueModule, CronModule],
})
export class BackgroundModule {}
