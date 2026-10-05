import { isAwsDeploymentTarget } from '@config/deployment-target.util';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { Module, Provider } from '@nestjs/common';
import { ReviewPostQueueUIModule } from '@review-post-queue/review-post-queue-ui.module';
import { ReviewPostQueueService } from '@review-post-queue/review-post-queue.service';
import { ReviewPostSqsConsumer } from '@review-post-queue/review-post-sqs.consumer';
import { ReviewPostProcessor } from '@review-post-queue/review-post.processor';

const isAws = isAwsDeploymentTarget();

/**
 * The **consumer half**, worker-only — same split `EmailQueueModule`/`EmailQueueUIModule` and
 * `ReviewSyncQueueModule`/`ReviewSyncQueueProducerModule` already keep, and for the identical
 * reason: NestJS's Bull explorer turns a `@Processor` provider anywhere in the graph into a live
 * BullMQ worker, so putting `ReviewPostProcessor` anywhere the API process can reach would make
 * the API start posting replies to Google itself. The producer lives in
 * `ReviewPostQueueUIModule` instead, which both processes safely import.
 *
 * `ReviewProviderModule`, `DBModule` and `ConnectionsModule`'s DB services are `@Global()`
 * (confirmed the same way `ReviewSyncQueueModule`'s own doc comment reasons about its equivalent
 * dependencies), so `ReviewPostQueueService`'s constructor resolves without an explicit import
 * here beyond `DeadLetterQueueModule`. `ReviewPostQueueUIModule` (the producer half) is imported so
 * `ReviewPostQueueService` can reschedule itself after a transient failure.
 */
const consumerProvider: Provider = isAws ? ReviewPostSqsConsumer : ReviewPostProcessor;

@Module({
  imports: [DeadLetterQueueModule, ReviewPostQueueUIModule],
  providers: [ReviewPostQueueService, consumerProvider],
})
export class ReviewPostQueueModule {}
