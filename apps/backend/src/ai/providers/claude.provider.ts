import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
 * Claude (Anthropic) implementation of the AI provider.
 *
 * Maps the common ChatMessage / ToolDefinition types to the Anthropic SDK
 * format, calls the Messages API, and normalises the result back to
 * ChatCompletionResult.
 */
@Injectable()
export class ClaudeAiProvider extends AiProvider {
  private readonly logger = new Logger(ClaudeAiProvider.name);
  private readonly client: Anthropic;
  private readonly defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    super();

    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY') ?? '';
    this.defaultModel =
      this.configService.get<string>('CLAUDE_DEFAULT_MODEL') ?? 'claude-sonnet-4-20250514';

    if (!apiKey) {
      this.logger.warn(
        'ANTHROPIC_API_KEY is not configured. Claude AI calls will fail until it is set.'
      );
    }

    this.client = new Anthropic({ apiKey });
  }

  get name(): string {
    return 'claude';
  }

  // ─── Chat Completion ───────────────────────────────────────────────────────

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const model = options.model ?? this.defaultModel;
    const maxTokens = options.maxTokens ?? 4096;

    try {
      // Anthropic treats system messages separately from the messages array.
      const systemMessages = options.messages.filter(m => m.role === 'system');
      const nonSystemMessages = options.messages.filter(m => m.role !== 'system');

      const systemPrompt =
        systemMessages.length > 0 ? systemMessages.map(m => m.content).join('\n') : undefined;

      const anthropicMessages = this.mapMessages(nonSystemMessages);

      // Build request params — only include optional fields when defined
      // (required by exactOptionalPropertyTypes).
      const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
        model,
        max_tokens: maxTokens,
        messages: anthropicMessages,
      };

      if (systemPrompt !== undefined) {
        requestParams.system = systemPrompt;
      }
      if (options.temperature !== undefined) {
        requestParams.temperature = options.temperature;
      }
      if (options.tools && options.tools.length > 0) {
        requestParams.tools = this.mapTools(options.tools);
      }

      const response = await this.client.messages.create(requestParams);

      return this.mapResponse(response);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Unknown Claude API error';
      this.logger.error(`Claude chatCompletion failed: ${errMsg}`);
      throw new Error(`Claude chatCompletion failed: ${errMsg}`);
    }
  }

  // ─── Embeddings (unsupported) ──────────────────────────────────────────────

  embed(_options: EmbeddingOptions): Promise<EmbeddingResult> {
    throw new Error(
      'Claude (Anthropic) does not provide an embeddings API. Use OpenAI or another provider for embeddings.'
    );
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Convert common ChatMessage[] to the Anthropic MessageParam format.
   * Anthropic only accepts 'user' and 'assistant' roles in the messages array.
   * Tool results are sent as 'user' messages with tool_result content blocks.
   */
  private mapMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
    return messages.map((msg): Anthropic.MessageParam => {
      if (msg.role === 'tool') {
        // Tool results are sent as user messages in Anthropic's format
        return {
          role: 'user',
          content: msg.content,
        };
      }

      return {
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      };
    });
  }

  /**
   * Map common ToolDefinition[] to Anthropic's Tool format.
   */
  private mapTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        ...tool.parameters,
      },
    }));
  }

  /**
   * Normalise the Anthropic Message response to a ChatCompletionResult.
   */
  private mapResponse(response: Anthropic.Message): ChatCompletionResult {
    // Extract text content from the response content blocks.
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    const content = textBlocks.map(b => b.text).join('');

    // Extract tool use blocks if any.
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    const toolCalls: ToolCall[] | undefined =
      toolUseBlocks.length > 0
        ? toolUseBlocks.map(block => ({
            id: block.id,
            name: block.name,
            arguments: JSON.stringify(block.input),
          }))
        : undefined;

    const result: ChatCompletionResult = {
      content,
      role: response.role,
      model: response.model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: response.stop_reason ?? 'end_turn',
    };

    if (toolCalls !== undefined) {
      result.toolCalls = toolCalls;
    }

    return result;
  }
}
