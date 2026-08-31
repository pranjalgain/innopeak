import { RagRepository } from '@db/repositories/ai/rag.repository';
import { Injectable, Logger } from '@nestjs/common';

import { EmbeddingService } from './embedding.service';
import { SearchResult } from './interfaces/document.interface';

const DEFAULT_SEARCH_LIMIT = 5;

/**
 * Handles semantic retrieval over the document store.
 *
 * Delegates embedding to EmbeddingService and vector search to RagRepository.
 * This service performs NO direct database calls.
 */
@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private readonly ragRepository: RagRepository,
    private readonly embeddingService: EmbeddingService
  ) {}

  /**
   * Perform a semantic search over stored document chunks.
   *
   * @param query     - Natural-language query text
   * @param limit     - Maximum number of results (default: 5)
   * @param threshold - Minimum cosine similarity score (0..1, default: 0)
   */
  async search(
    query: string,
    limit: number = DEFAULT_SEARCH_LIMIT,
    threshold?: number
  ): Promise<SearchResult[]> {
    const start = Date.now();

    const queryEmbedding = await this.embeddingService.embedText(query);
    const results = await this.ragRepository.similaritySearch(queryEmbedding, limit, threshold);

    const latencyMs = Date.now() - start;
    this.logger.debug(
      `Search for "${query.slice(0, 60)}" returned ${String(results.length)} result(s) in ${String(latencyMs)}ms`
    );

    return results;
  }

  /**
   * Semantic search with post-hoc metadata filtering.
   *
   * First retrieves `limit * 3` candidates from the vector store, then
   * filters by the provided metadata predicate, returning at most `limit`.
   *
   * @param query  - Natural-language query text
   * @param filter - Predicate applied to each chunk's metadata
   * @param limit  - Maximum number of results after filtering (default: 5)
   */
  async searchWithMetadataFilter(
    query: string,
    filter: (metadata: unknown) => boolean,
    limit: number = DEFAULT_SEARCH_LIMIT
  ): Promise<SearchResult[]> {
    // Over-fetch to compensate for filtering
    const overFetchLimit = limit * 3;

    const candidates = await this.search(query, overFetchLimit);

    const filtered = candidates.filter(result => filter(result.chunk.metadata));

    return filtered.slice(0, limit);
  }
}
