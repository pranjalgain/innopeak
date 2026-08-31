import { Injectable } from '@nestjs/common';

import {
  ChatCompletionOptions,
  ChatCompletionResult,
  EmbeddingOptions,
  EmbeddingResult,
} from '../interfaces/ai-provider.interface';

/**
 * Abstract base class for all AI providers.
 * Concrete providers (Claude, OpenAI, etc.) extend this class and map
 * vendor-specific SDKs to the common interface types.
 */
@Injectable()
export abstract class AiProvider {
  /** Human-readable provider identifier (e.g. "claude", "openai"). */
  abstract get name(): string;

  /**
   * Send a chat completion request to the provider.
   * Implementations must map ChatMessage[] to the vendor SDK format,
   * call the API, and return a normalised ChatCompletionResult.
   */
  abstract chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult>;

  /**
   * Generate vector embeddings for the given input text(s).
   * Providers that do not offer an embedding API should throw
   * an appropriate error.
   */
  abstract embed(options: EmbeddingOptions): Promise<EmbeddingResult>;
}
