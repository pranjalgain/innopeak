import { BillingModule } from '@billing/billing.module';
import type { EnvConfig } from '@config/env.config';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReviewPostQueueUIModule } from '@review-post-queue/review-post-queue-ui.module';

import { AiReplyGenerationService } from './ai-reply-generation.service';
import { AiController } from './ai.controller';
import { AiProvider } from './providers/ai.provider';
import { AzureOpenAiProvider } from './providers/azure-openai.provider';
import { OpenRouterAiProvider } from './providers/openrouter-ai.provider';

// NOTE: `PromptsDbService`/`AuthDbService`/`AdminBusinessesDbService`/`ReviewSyncDbService` aren't
// imported here — `DBModule` is `@Global()` and provides all of them, same as `BillingModule`'s
// own doc comment explains for its DB services.

const logger = new Logger('AiModule');

/**
 * Same DI-swap shape as `BillingModule`'s `paymentProviderFactory` — see that file's own doc
 * comment for why the selection lives in a module-scoped factory. `'azure'` is the default and
 * intended production provider (PLAN.md §5's GDPR/`westeurope` requirement); `'openrouter'`
 * remains a real, working secondary option.
 */
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
 * `BillingModule` for `BillingEntitlementsService` (the AI-draft monthly-limit check) — same
 * explicit-import reasoning as `PromptsModule`'s own doc comment.
 *
 * `AiReplyGenerationService` is exported, unlike a module whose service only its own controller
 * calls: `ReviewSyncQueueModule` (the worker process — `WorkerModule` never imports API modules,
 * only `ReviewSyncQueueModule` itself does) imports this module specifically to call
 * `generateForClassifiedReviews`. Not `@Global()` — matching `BillingModule`'s own choice not to
 * be, for the same reason: an explicit import at every real call site is what makes "who depends
 * on AI generation" answerable by reading imports, not by knowing this module happens to be
 * global.
 */
@Module({
  imports: [BillingModule, ReviewPostQueueUIModule],
  controllers: [AiController],
  providers: [aiProviderFactory, AiReplyGenerationService],
  exports: [AiReplyGenerationService],
})
export class AiModule {}
