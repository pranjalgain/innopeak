import type { EnvConfig } from '@config/env.config';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { AiProvider } from './ai.provider';
import { AzureOpenAiProvider } from './azure-openai.provider';
import { OpenRouterAiProvider } from './openrouter-ai.provider';

const logger = new Logger('AiProvider');

/**
 * The one place `AI_PROVIDER` is read: `'azure'` is the default production provider (GDPR, approved EU regions) and `'openrouter'` a
 * working secondary option. Shared by `AiModule` and the `ai:dry-run` script so the script exercises exactly what the app would use.
 */
export function createAiProvider(configService: ConfigService<EnvConfig>): AiProvider {
  const providerType = configService.get<string>('AI_PROVIDER') ?? 'azure';

  logger.log(`Initializing AI provider: ${providerType}`);

  switch (providerType) {
    case 'openrouter':
      return new OpenRouterAiProvider(configService);
    case 'azure':
    default:
      return new AzureOpenAiProvider(configService);
  }
}
