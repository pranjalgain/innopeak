import { RetrievalService } from '@ai/rag/retrieval.service';
import { Injectable, Logger } from '@nestjs/common';

import { AgentTool } from '../interfaces/tool.interface';

/**
 * Built-in agent tool that performs semantic search over the RAG document store.
 * Uses the RetrievalService for vector similarity search.
 */
@Injectable()
export class SearchTool implements AgentTool {
  private readonly logger = new Logger(SearchTool.name);

  readonly name = 'rag_search';

  readonly description =
    'Search the knowledge base using semantic similarity. ' +
    'Useful for finding relevant documents, articles, or information ' +
    'that has been indexed in the system.';

  readonly parameters: Record<string, unknown> = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The natural language search query',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)',
      },
    },
    required: ['query'],
  };

  constructor(private readonly retrievalService: RetrievalService) {}

  async execute(args: Record<string, unknown>): Promise<string> {
    const query = args['query'];
    if (typeof query !== 'string' || query.trim().length === 0) {
      return 'Error: "query" parameter is required and must be a non-empty string.';
    }

    const limit = typeof args['limit'] === 'number' ? args['limit'] : 5;

    try {
      const results = await this.retrievalService.search(query, limit);

      if (results.length === 0) {
        return 'No relevant documents found for the given query.';
      }

      const formatted = results.map((result, index) => {
        const title = result.document.title ?? 'Untitled';
        const source = result.document.source ?? 'Unknown source';
        const score = result.score.toFixed(3);
        const content = result.chunk.content.slice(0, 500);

        return (
          `--- Result ${String(index + 1)} ---\n` +
          `Title: ${title}\n` +
          `Source: ${source}\n` +
          `Relevance: ${score}\n` +
          `Content: ${content}\n`
        );
      });

      this.logger.debug(
        `RAG search for "${query.slice(0, 60)}" returned ${String(results.length)} results`
      );

      return formatted.join('\n');
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`RAG search failed: ${message}`);
      return `Error performing search: ${message}`;
    }
  }
}
