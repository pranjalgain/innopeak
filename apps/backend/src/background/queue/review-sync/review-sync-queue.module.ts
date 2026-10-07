import { AiModule } from '@ai/ai.module';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { Module } from '@nestjs/common';
import { ReviewSyncQueueService } from '@review-sync-queue/review-sync-queue.service';
import { ReviewSyncProcessor } from '@review-sync-queue/review-sync.processor';

/**
 * BullMQ only (no SQS consumer). Worker-only: importing it from anything the API reaches would make
 * the API run backfills and polls itself, since `@Processor` becomes a live worker. No
 * `registerQueue` here; only the producer's `@InjectQueue` needs it.
 *
 * `AiModule` is not global and `WorkerModule` imports no API modules, so without the explicit
 * import the worker fails to boot resolving `AiReplyGenerationService`.
 */
@Module({
  imports: [DeadLetterQueueModule, AiModule],
  providers: [ReviewSyncQueueService, ReviewSyncProcessor],
})
export class ReviewSyncQueueModule {}
