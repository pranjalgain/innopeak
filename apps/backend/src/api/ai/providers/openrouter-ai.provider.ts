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
  OPENROUTER_BASE_URL,
} from '../constants/ai.constants';
import {
  AiGenerationFailedException,
  AiProviderNotConfiguredException,
} from '../exceptions/ai.exceptions';
import type { GenerateReplyInput, GenerateReplyResult } from '../types/ai-provider.type';

/**
 * Names the likely cause of an empty reply. Reasoning models put output in the OpenRouter-only
 * `message.reasoning` field (absent from the SDK type, hence the narrow structural read); if those
 * tokens exhaust `max_tokens`, `content` is `null` with `finish_reason: 'length'`.
 */
function describeEmptyContentCause(
  choice: OpenAI.Chat.Completions.ChatCompletion['choices'][number] | undefined,
  completion: OpenAI.Chat.Completions.ChatCompletion
): string {
  const reasoning = (choice?.message as { reasoning?: unknown } | undefined)?.reasoning;
  if (typeof reasoning === 'string' && reasoning.trim().length > 0) {
    return (
      ' The model returned reasoning but no answer — it is a reasoning model and spent its whole' +
      ` output budget (${completion.usage?.completion_tokens ?? '?'} tokens) thinking.` +
      ' Raise AI_MAX_OUTPUT_TOKENS or set OPENROUTER_MODEL to a non-reasoning model.'
    );
  }
  return '';
}

/**
 * OpenRouter provider (`AI_PROVIDER=openrouter`), via the official `openai` SDK pointed at
 * OpenRouter's `baseURL`.
 *
 * Config is read and the client built on the first real call, not in the constructor: nothing in
 * the product depends on this provider yet, so a missing key must not fail app startup.
 */
@Injectable()
export class OpenRouterAiProvider extends AiProvider {
  private readonly logger = new Logger(OpenRouterAiProvider.name);
  private client: OpenAI | null = null;
  private model: string | null = null;

  constructor(private readonly configService: ConfigService<EnvConfig>) {
    super();
  }

  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
    const { client, model } = this.getClient();

    const startedAt = Date.now();
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await client.chat.completions.create(
        {
          model,
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
        `OpenRouter chat completion failed for model "${model}": ${
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
        `OpenRouter returned no completion content for model "${model}" (finish_reason: ${
          choice?.finish_reason ?? 'unknown'
        }).${describeEmptyContentCause(choice, completion)}`
      );
      throw new AiGenerationFailedException();
    }

    const finishReason = choice?.finish_reason ?? null;
    if (finishReason !== null && finishReason !== 'stop') {
      // Not an exception: the caller still gets the partial text, but `length` means the reply
      // was cut off mid-sentence at AI_MAX_OUTPUT_TOKENS, so it must not pass silently.
      this.logger.warn(
        `OpenRouter finished with "${finishReason}" (not "stop") for model "${model}" — the reply is likely incomplete.` +
          ' Raise AI_MAX_OUTPUT_TOKENS, or use a model that does not spend the budget on reasoning.'
      );
    }

    return {
      content: content.trim(),
      // Can differ from the requested model (e.g. a `:free` variant rerouted under load).
      model: completion.model,
      promptTokens: completion.usage?.prompt_tokens ?? null,
      completionTokens: completion.usage?.completion_tokens ?? null,
      latencyMs,
      finishReason,
    };
  }

  /** Memoized: config is read from process env once at boot. */
  private getClient(): { client: OpenAI; model: string } {
    if (this.client !== null && this.model !== null) {
      return { client: this.client, model: this.model };
    }

    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    const model = this.configService.get<string>('OPENROUTER_MODEL');
    if (apiKey === undefined || apiKey.length === 0 || model === undefined || model.length === 0) {
      throw new AiProviderNotConfiguredException();
    }

    this.client = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL });
    this.model = model;
    return { client: this.client, model: this.model };
  }
}
