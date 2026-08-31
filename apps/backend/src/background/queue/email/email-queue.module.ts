import { isAwsDeploymentTarget } from '@config/deployment-target.util';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { EmailModule } from '@email/email.module';
import { EmailQueueService } from '@email-queue/email-queue.service';
import { EmailSqsConsumer } from '@email-queue/email-sqs.consumer';
import { EmailProcessor } from '@email-queue/email.processor';
import { Module, Provider } from '@nestjs/common';

const isAws = isAwsDeploymentTarget();

// Both EmailProcessor (BullMQ, local) and EmailSqsConsumer (SQS, aws) push failed jobs to
// DeadLetterQueueService, so DeadLetterQueueModule is imported in both modes.
const consumerProvider: Provider = isAws ? EmailSqsConsumer : EmailProcessor;

@Module({
  imports: [EmailModule, DeadLetterQueueModule],
  providers: [EmailQueueService, consumerProvider],
})
export class EmailQueueModule {}
