import { MESSAGES } from '@common/constants/messages.constants';
import type { EnvConfig } from '@config/env.config';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { AiProvider } from './ai.provider';

import {
  AI_MAX_OUTPUT_TOKENS,
  AI_MAX_RETRIES,
  AI_REQUEST_TIMEOUT_MS,
  AI_TEMPERATURE,
} from '../constants/ai.constants';
import {
  AiGenerationFailedException,
  AiProviderNotConfiguredException,
} from '../exceptions/ai.exceptions';
import type { GenerateReplyInput, GenerateReplyResult } from '../types/ai-provider.type';

/** GDPR requirement, not a preference, so it is validated rather than left to convention. */
const REQUIRED_AZURE_REGION = 'westeurope';

/**
 * Default `AiProvider` (`AI_PROVIDER=azure`). Always calls the configured Azure OpenAI deployment; there
 * is no local stand-in.
 *
 * Config is read and the SDK client built on the first real call, not in the constructor, so a
 * misconfigured value fails that generation attempt with `AiProviderNotConfiguredException`
 * rather than app startup.
 */
@Injectable()
export class AzureOpenAiProvider extends AiProvider {
  private readonly logger = new Logger(AzureOpenAiProvider.name);
  private client: OpenAI | null = null;
  private deployment: string | null = null;

  constructor(private readonly configService: ConfigService<EnvConfig>) {
    super();
  }

  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
    const { client, deployment } = this.getClient();

    const startedAt = Date.now();
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await client.chat.completions.create(
        {
          model: deployment,
          messages: [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.userPrompt },
          ],
          temperature: AI_TEMPERATURE,
          max_tokens: input.maxOutputTokens ?? AI_MAX_OUTPUT_TOKENS,
        },
        { timeout: AI_REQUEST_TIMEOUT_MS, maxRetries: AI_MAX_RETRIES }
      );
    } catch (error: unknown) {
      this.logger.error(
        `Azure OpenAI chat completion failed for deployment "${deployment}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw new AiGenerationFailedException();
    }
    const latencyMs = Date.now() - startedAt;

    const choice = completion.choices[0];
    const content = choice?.message.content;
    if (content === undefined || content === null || content.trim().length === 0) {
      this.logger.error(
        `Azure OpenAI returned no completion content for deployment "${deployment}" (finish_reason: ${
          choice?.finish_reason ?? 'unknown'
        }).`
      );
      throw new AiGenerationFailedException();
    }

    const finishReason = choice?.finish_reason ?? null;
    if (finishReason !== null && finishReason !== 'stop') {
      this.logger.warn(
        `Azure OpenAI finished with "${finishReason}" (not "stop") for deployment "${deployment}" — the reply is likely incomplete.`
      );
    }

    return {
      content: content.trim(),
      model: completion.model,
      promptTokens: completion.usage?.prompt_tokens ?? null,
      completionTokens: completion.usage?.completion_tokens ?? null,
      latencyMs,
      finishReason,
    };
  }

  /** Memoized: config cannot change without a process restart. */
  private getClient(): { client: OpenAI; deployment: string } {
    if (this.client !== null && this.deployment !== null) {
      return { client: this.client, deployment: this.deployment };
    }

    const endpoint = this.configService.get<string>('AZURE_OPENAI_ENDPOINT');
    const apiKey = this.configService.get<string>('AZURE_OPENAI_API_KEY');
    const deployment = this.configService.get<string>('AZURE_OPENAI_DEPLOYMENT');
    const apiVersion = this.configService.get<string>('AZURE_OPENAI_API_VERSION');
    if (
      endpoint === undefined ||
      endpoint.length === 0 ||
      apiKey === undefined ||
      apiKey.length === 0 ||
      deployment === undefined ||
      deployment.length === 0 ||
      apiVersion === undefined ||
      apiVersion.length === 0
    ) {
      throw new AiProviderNotConfiguredException(MESSAGES.AI.AZURE_PROVIDER_NOT_CONFIGURED);
    }

    const region = this.configService.get<string>('AZURE_OPENAI_REGION');
    if (region !== REQUIRED_AZURE_REGION) {
      throw new AiProviderNotConfiguredException(MESSAGES.AI.AZURE_REGION_INVALID);
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: `${endpoint.replace(/\/+$/, '')}/openai/deployments/${deployment}`,
      defaultQuery: { 'api-version': apiVersion },
      defaultHeaders: { 'api-key': apiKey },
    });
    this.deployment = deployment;
    return { client: this.client, deployment: this.deployment };
  }
}
