import { isAwsDeploymentTarget } from '@config/deployment-target.util';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { Module, Provider } from '@nestjs/common';
import { ReviewPostQueueUIModule } from '@review-post-queue/review-post-queue-ui.module';
import { ReviewPostQueueService } from '@review-post-queue/review-post-queue.service';
import { ReviewPostSqsConsumer } from '@review-post-queue/review-post-sqs.consumer';
import { ReviewPostProcessor } from '@review-post-queue/review-post.processor';

const isAws = isAwsDeploymentTarget();

/**
 * Consumer half, worker-only: Nest's Bull explorer turns any `@Processor` in the graph into a live
 * worker, so the API process importing this would start posting replies to Google. The producer
 * lives in `ReviewPostQueueUIModule`, which both import (so the service can reschedule itself after
 * a transient failure). Other dependencies are `@Global()`.
 */
const consumerProvider: Provider = isAws ? ReviewPostSqsConsumer : ReviewPostProcessor;

@Module({
  imports: [DeadLetterQueueModule, ReviewPostQueueUIModule],
  providers: [ReviewPostQueueService, consumerProvider],
})
export class ReviewPostQueueModule {}
