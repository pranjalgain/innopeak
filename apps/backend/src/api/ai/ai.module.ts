import { BillingModule } from '@billing/billing.module';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReviewPostQueueUIModule } from '@review-post-queue/review-post-queue-ui.module';

import { AiReplyGenerationService } from './ai-reply-generation.service';
import { AiProvider } from './providers/ai.provider';
import { createAiProvider } from './providers/create-ai-provider';

// DB services come from the `@Global()` `DBModule`, so they aren't imported here.

const aiProviderFactory = {
  provide: AiProvider,
  useFactory: createAiProvider,
  inject: [ConfigService],
};

/**
 * `AiReplyGenerationService` is exported because `ReviewSyncQueueModule` (the worker process) calls
 * `generateForClassifiedReviews`. Not `@Global()`, so dependents stay visible in imports.
 */
@Module({
  imports: [BillingModule, ReviewPostQueueUIModule],
  providers: [aiProviderFactory, AiReplyGenerationService],
  exports: [AiReplyGenerationService],
})
export class AiModule {}
