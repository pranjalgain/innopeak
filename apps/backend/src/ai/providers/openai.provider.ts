import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { AiProvider } from './ai.provider';

import {
  ChatCompletionOptions,
  ChatCompletionResult,
  ChatMessage,
  EmbeddingOptions,
  EmbeddingResult,
  ToolCall,
  ToolDefinition,
} from '../interfaces/ai-provider.interface';

/**
 * OpenAI implementation of the AI provider.
 *
 * Maps the common ChatMessage / ToolDefinition types to the OpenAI SDK format,
 * calls the Chat Completions or Embeddings API, and normalises the result back
 * to the common interfaces.
 */
@Injectable()
export class OpenAiProvider extends AiProvider {
  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly client: OpenAI;
  private readonly defaultModel: string;
  private readonly defaultEmbeddingModel: string;

  constructor(private readonly configService: ConfigService) {
    super();

    const apiKey = this.configService.get<string>('OPENAI_API_KEY') ?? '';
    this.defaultModel = this.configService.get<string>('OPENAI_DEFAULT_MODEL') ?? 'gpt-4o';
    this.defaultEmbeddingModel = 'text-embedding-3-small';

    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY is not configured. OpenAI calls will fail until it is set.');
    }

    this.client = new OpenAI({ apiKey });
  }

  get name(): string {
    return 'openai';
  }

  // ─── Chat Completion ───────────────────────────────────────────────────────

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const model = options.model ?? this.defaultModel;

    try {
      const openaiMessages = this.mapMessages(options.messages);

      // Build request params — only set optional keys when they have values
      // (required by exactOptionalPropertyTypes).
      const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
        model,
        messages: openaiMessages,
      };

      if (options.maxTokens !== undefined) {
        requestParams.max_completion_tokens = options.maxTokens;
      }
      if (options.temperature !== undefined) {
        requestParams.temperature = options.temperature;
      }
      if (options.tools && options.tools.length > 0) {
        requestParams.tools = this.mapTools(options.tools);
      }

      const response = await this.client.chat.completions.create(requestParams);

      return this.mapResponse(response);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Unknown OpenAI API error';
      this.logger.error(`OpenAI chatCompletion failed: ${errMsg}`);
      throw new Error(`OpenAI chatCompletion failed: ${errMsg}`);
    }
  }

  // ─── Embeddings ────────────────────────────────────────────────────────────

  async embed(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const model = options.model ?? this.defaultEmbeddingModel;

    try {
      const response = await this.client.embeddings.create({
        input: options.input,
        model,
      });

      const embeddings = response.data.map(item => item.embedding);

      return {
        embeddings,
        model: response.model,
        usage: {
          totalTokens: response.usage.total_tokens,
        },
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Unknown OpenAI API error';
      this.logger.error(`OpenAI embed failed: ${errMsg}`);
      throw new Error(`OpenAI embed failed: ${errMsg}`);
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Convert common ChatMessage[] to OpenAI ChatCompletionMessageParam format.
   */
  private mapMessages(
    messages: ChatMessage[]
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map((msg): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
      switch (msg.role) {
        case 'system':
          return { role: 'system', content: msg.content };
        case 'user':
          return { role: 'user', content: msg.content };
        case 'assistant':
          return { role: 'assistant', content: msg.content };
        case 'tool':
          // Tool messages in OpenAI require a tool_call_id.
          // When bridging from the common format, the content carries the result.
          return {
            role: 'tool',
            content: msg.content,
            tool_call_id: '',
          };
        default:
          return { role: 'user', content: msg.content };
      }
    });
  }

  /**
   * Map common ToolDefinition[] to OpenAI ChatCompletionTool format.
   */
  private mapTools(tools: ToolDefinition[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Normalise the OpenAI ChatCompletion response to a ChatCompletionResult.
   */
  private mapResponse(response: OpenAI.Chat.Completions.ChatCompletion): ChatCompletionResult {
    const firstChoice = response.choices[0];
    const message = firstChoice?.message;
    const content = message?.content ?? '';
    const finishReason = firstChoice?.finish_reason ?? 'stop';

    // Map tool calls if present
    const rawToolCalls = message?.tool_calls;
    const toolCalls: ToolCall[] | undefined =
      rawToolCalls && rawToolCalls.length > 0
        ? rawToolCalls.map(tc => ({
            id: tc.id,
            name: tc.type === 'function' ? tc.function.name : '',
            arguments: tc.type === 'function' ? tc.function.arguments : '',
          }))
        : undefined;

    const result: ChatCompletionResult = {
      content,
      role: message?.role ?? 'assistant',
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      finishReason,
    };

    if (toolCalls !== undefined) {
      result.toolCalls = toolCalls;
    }

    return result;
  }
}
