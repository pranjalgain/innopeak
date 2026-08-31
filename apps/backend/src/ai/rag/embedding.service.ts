import { Injectable, Logger } from '@nestjs/common';

import { AiService } from '../ai.service';

/**
 * Thin wrapper around AiService that provides a convenient embedding API
 * for the RAG pipeline.
 *
 * This service performs NO database calls.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(private readonly aiService: AiService) {}

  /**
   * Embed a single text string.
   *
   * @returns The embedding vector (number[]).
   */
  async embedText(text: string): Promise<number[]> {
    const response = await this.aiService.embed({ input: text });

    const embedding = response.data.embeddings[0];
    if (!embedding) {
      throw new Error('No embedding returned from AI service');
    }

    this.logger.debug(
      `Embedded single text (${String(text.length)} chars) in ${String(response.latencyMs)}ms`
    );

    return embedding;
  }

  /**
   * Embed multiple texts in a single batch call.
   *
   * @returns Array of embedding vectors, one per input text,
   *          in the same order as the input.
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await this.aiService.embed({ input: texts });

    this.logger.debug(
      `Embedded ${String(texts.length)} text(s) in ${String(response.latencyMs)}ms ` +
        `(${String(response.data.usage.totalTokens)} tokens)`
    );

    return response.data.embeddings;
  }
}
