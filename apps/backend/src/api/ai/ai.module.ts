import { BillingModule } from '@billing/billing.module';
import type { EnvConfig } from '@config/env.config';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReviewPostQueueUIModule } from '@review-post-queue/review-post-queue-ui.module';

import { AiReplyGenerationService } from './ai-reply-generation.service';
import { AiProvider } from './providers/ai.provider';
import { AzureOpenAiProvider } from './providers/azure-openai.provider';
import { OpenRouterAiProvider } from './providers/openrouter-ai.provider';

// DB services come from the `@Global()` `DBModule`, so they aren't imported here.

const logger = new Logger('AiModule');

/** `'azure'` is the default production provider (GDPR/`westeurope` requirement); `'openrouter'` is a working secondary option. */
const aiProviderFactory = {
  provide: AiProvider,
  useFactory: (configService: ConfigService<EnvConfig>): AiProvider => {
    const providerType = configService.get<string>('AI_PROVIDER') ?? 'azure';

    logger.log(`Initializing AI provider: ${providerType}`);

    switch (providerType) {
      case 'openrouter':
        return new OpenRouterAiProvider(configService);
      case 'azure':
      default:
        return new AzureOpenAiProvider(configService);
    }
  },
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
