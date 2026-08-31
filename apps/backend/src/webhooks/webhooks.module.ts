import { Module } from '@nestjs/common';

import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

import { WebhookQueueUIModule } from '../background/queue/webhook/webhook-queue-ui.module';

@Module({
  imports: [WebhookQueueUIModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
