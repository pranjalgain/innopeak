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
 * Adds the *likely cause* to the "no content" log line, because the two realistic causes need
 * opposite fixes and the raw response looks nearly identical either way.
 *
 * A reasoning model (several of OpenRouter's free tier are) puts its output in the non-standard
 * `message.reasoning` field — an OpenRouter extension absent from the SDK's own `ChatCompletion`
 * type, hence the narrow structural read rather than a cast of the whole message. When those
 * reasoning tokens exhaust `max_tokens`, the model never reaches its actual answer and `content`
 * comes back `null` with `finish_reason: 'length'` — an API success that this provider correctly
 * treats as a failure, but for a reason an operator would otherwise have to discover by hand.
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
 * OpenRouter — an OpenAI-Chat-Completions-compatible router in front of many models, selected via
 * `AI_PROVIDER=openrouter` (`AiModule`'s factory). Uses the official `openai` SDK pointed at
 * OpenRouter's own `baseURL` rather than a hand-rolled `fetch` call: OpenRouter's API is a
 * drop-in-compatible superset of OpenAI's, and Azure OpenAI (the planned next provider, per
 * PLAN.md §5) speaks the same request/response shape through the same SDK — so the eventual
 * `AzureOpenAiProvider` differs from this file mainly in how the client is constructed
 * (`baseURL`/`apiVersion`/`deployment` vs a flat `apiKey`+`model`), not in how a completion is
 * requested or parsed. That shared shape is the actual "plug and play" property, not just the
 * `AiProvider` interface on its own.
 *
 * Deliberately reads `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` — and constructs the SDK client — on
 * the first real call, not in the constructor. Nothing in the product calls this yet (dry-run
 * testing only, see `apps/documentation/docs/backend/ai/overview.md`), so a missing key must not
 * fail app startup the way a misconfigured Stripe key does for `StripePaymentProvider`, which
 * *is* load-bearing today.
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
      // Not an exception: the caller still gets the partial text (a dry run exists to show what
      // the model actually did), but this must not pass silently — `length` in particular means
      // the reply is cut off mid-sentence at AI_MAX_OUTPUT_TOKENS.
      this.logger.warn(
        `OpenRouter finished with "${finishReason}" (not "stop") for model "${model}" — the reply is likely incomplete.` +
          ' Raise AI_MAX_OUTPUT_TOKENS, or use a model that does not spend the budget on reasoning.'
      );
    }

    return {
      content: content.trim(),
      // OpenRouter echoes back which underlying model actually served the request — can differ
      // from what was requested (e.g. a `:free` variant rerouted under load).
      model: completion.model,
      promptTokens: completion.usage?.prompt_tokens ?? null,
      completionTokens: completion.usage?.completion_tokens ?? null,
      latencyMs,
      finishReason,
    };
  }

  /** Memoized: constructing the SDK client is cheap but pointless to repeat per call, and the
   *  config values themselves cannot change without a restart anyway (`ConfigService` reads
   *  process env once at boot). */
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
