import { isAwsDeploymentTarget } from '@config/deployment-target.util';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { Module, Provider } from '@nestjs/common';

import { WebhookQueueService } from './webhook-queue.service';
import { WebhookSqsConsumer } from './webhook-sqs.consumer';
import { WebhookProcessor } from './webhook.processor';

const isAws = isAwsDeploymentTarget();
const consumerProvider: Provider = isAws ? WebhookSqsConsumer : WebhookProcessor;

@Module({
  imports: [DeadLetterQueueModule],
  providers: [WebhookQueueService, consumerProvider],
})
export class WebhookQueueModule {}
