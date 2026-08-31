import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ChatCompletionOptions,
  ChatCompletionResult,
  EmbeddingOptions,
  EmbeddingResult,
  StructuredOutputOptions,
} from './interfaces/ai-provider.interface';
import { AiResponse } from './interfaces/ai-response.interface';
import { AiProvider } from './providers/ai.provider';
import { ClaudeAiProvider } from './providers/claude.provider';
import { OpenAiProvider } from './providers/openai.provider';

type AiProviderName = 'claude' | 'openai';

/**
 * Facade service for AI operations.
 *
 * Delegates to the appropriate AI provider (Claude / OpenAI) based on
 * configuration or explicit request. Wraps every result in an AiResponse
 * that includes latency tracking, provider metadata, and token usage.
 *
 * This service makes NO direct database calls; persistence is the
 * responsibility of higher-level services or repositories.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly defaultProvider: AiProviderName;
  private readonly providerMap: Map<string, AiProvider>;

  constructor(
    private readonly configService: ConfigService,
    private readonly claudeProvider: ClaudeAiProvider,
    private readonly openaiProvider: OpenAiProvider
  ) {
    const configured = this.configService.get<string>('AI_DEFAULT_PROVIDER') ?? 'claude';
    this.defaultProvider = (configured === 'openai' ? 'openai' : 'claude') as AiProviderName;

    this.providerMap = new Map<string, AiProvider>([
      ['claude', this.claudeProvider],
      ['openai', this.openaiProvider],
    ]);

    this.logger.log(`AI service initialised — default provider: ${this.defaultProvider}`);
  }

  // ─── Chat Completion ───────────────────────────────────────────────────────

  /**
   * Run a chat completion through the specified (or default) provider.
   *
   * @param options  - Messages, model, temperature, tools, etc.
   * @param providerName - Override the default provider for this call.
   * @returns Wrapped AiResponse containing the ChatCompletionResult.
   */
  async chatCompletion(
    options: ChatCompletionOptions,
    providerName?: string
  ): Promise<AiResponse<ChatCompletionResult>> {
    const provider = this.getProvider(providerName);
    const startMs = Date.now();

    try {
      const result = await provider.chatCompletion(options);
      const latencyMs = Date.now() - startMs;

      this.logger.debug(
        `chatCompletion [${provider.name}] completed in ${String(latencyMs)}ms — ` +
          `tokens: ${String(result.usage.totalTokens)}`
      );

      return {
        data: result,
        provider: provider.name,
        model: result.model,
        usage: result.usage,
        latencyMs,
      };
    } catch (error: unknown) {
      const latencyMs = Date.now() - startMs;
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `chatCompletion [${provider.name}] failed after ${String(latencyMs)}ms: ${errMsg}`
      );
      throw error;
    }
  }

  // ─── Embeddings ────────────────────────────────────────────────────────────

  /**
   * Generate vector embeddings for the given input.
   * Defaults to OpenAI because Claude does not offer an embeddings API.
   *
   * @param options  - Input text(s) and optional model override.
   * @param providerName - Provider to use (defaults to "openai").
   * @returns Wrapped AiResponse containing the EmbeddingResult.
   */
  async embed(
    options: EmbeddingOptions,
    providerName?: string
  ): Promise<AiResponse<EmbeddingResult>> {
    // Default to OpenAI for embeddings since Claude does not support them.
    const resolvedName = providerName ?? 'openai';
    const provider = this.getProvider(resolvedName);
    const startMs = Date.now();

    try {
      const result = await provider.embed(options);
      const latencyMs = Date.now() - startMs;

      this.logger.debug(
        `embed [${provider.name}] completed in ${String(latencyMs)}ms — ` +
          `tokens: ${String(result.usage.totalTokens)}`
      );

      return {
        data: result,
        provider: provider.name,
        model: result.model,
        usage: {
          promptTokens: result.usage.totalTokens,
          completionTokens: 0,
          totalTokens: result.usage.totalTokens,
        },
        latencyMs,
      };
    } catch (error: unknown) {
      const latencyMs = Date.now() - startMs;
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`embed [${provider.name}] failed after ${String(latencyMs)}ms: ${errMsg}`);
      throw error;
    }
  }

  // ─── Structured Output ─────────────────────────────────────────────────────

  /**
   * Request a chat completion that conforms to a JSON schema.
   *
   * Works by injecting a system instruction that tells the model to respond
   * with valid JSON matching the supplied schema, then parses the result.
   *
   * @param options  - Messages, JSON schema, and schema name.
   * @param providerName - Override the default provider.
   * @returns Wrapped AiResponse whose data.content is the JSON string.
   */
  async structuredOutput<T = unknown>(
    options: StructuredOutputOptions<T>,
    providerName?: string
  ): Promise<AiResponse<ChatCompletionResult>> {
    const schemaInstruction =
      `You MUST respond with ONLY valid JSON that conforms to the following JSON schema ` +
      `named "${options.schemaName}":\n\n${JSON.stringify(options.schema, null, 2)}\n\n` +
      `Do not include any text outside the JSON object. Do not use markdown code fences.`;

    // Prepend the schema instruction as a system message.
    const messagesWithSchema = [
      { role: 'system' as const, content: schemaInstruction },
      ...options.messages,
    ];

    const completionOptions: ChatCompletionOptions = {
      messages: messagesWithSchema,
    };

    if (options.model !== undefined) {
      completionOptions.model = options.model;
    }

    return this.chatCompletion(completionOptions, providerName);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Resolve the requested provider by name, falling back to the default.
   * Throws if the provider name is unknown.
   */
  private getProvider(providerName?: string): AiProvider {
    const name = providerName ?? this.defaultProvider;
    const provider = this.providerMap.get(name);

    if (!provider) {
      throw new Error(
        `Unknown AI provider "${name}". Available providers: ${[...this.providerMap.keys()].join(', ')}`
      );
    }

    return provider;
  }
}
