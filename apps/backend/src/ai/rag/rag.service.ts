import { RagRepository } from '@db/repositories/ai/rag.repository';
import { Injectable, Logger } from '@nestjs/common';

import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';
import {
  DocumentRecord,
  IngestDocumentOptions,
  SearchResult,
} from './interfaces/document.interface';
import { RetrievalService } from './retrieval.service';

/**
 * Facade service for the RAG (Retrieval-Augmented Generation) pipeline.
 *
 * Orchestrates document ingestion (chunking + embedding + storage) and
 * semantic retrieval. All database access goes through RagRepository;
 * no direct DB calls are made here.
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly ragRepository: RagRepository,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingService: EmbeddingService,
    private readonly retrievalService: RetrievalService
  ) {}

  // ─── Ingestion ──────────────────────────────────────────────────────────────

  /**
   * Ingest a document into the RAG pipeline.
   *
   * Steps:
   * 1. Create a document record
   * 2. Chunk the content using the specified strategy
   * 3. Persist the chunks
   * 4. Generate embeddings for all chunks (batch)
   * 5. Store each embedding in the vector column
   *
   * @returns The created DocumentRecord (without chunks for brevity).
   */
  async ingestDocument(options: IngestDocumentOptions): Promise<DocumentRecord> {
    const start = Date.now();

    // 1. Create the document record
    const document = await this.ragRepository.createDocument({
      title: options.title,
      source: options.source,
      content: options.content,
      metadata: options.metadata,
    });

    this.logger.debug(`Created document ${document.id}`);

    // 2. Chunk the content
    const strategy = options.chunkingStrategy ?? 'recursive';
    const chunkSize = options.chunkSize ?? 1000;
    const chunkOverlap = options.chunkOverlap ?? 200;

    const textChunks = this.chunkingService.chunk(
      options.content,
      strategy,
      chunkSize,
      chunkOverlap
    );

    if (textChunks.length === 0) {
      this.logger.warn(`Document ${document.id} produced 0 chunks — skipping embedding`);
      return document;
    }

    this.logger.debug(
      `Document ${document.id}: ${String(textChunks.length)} chunk(s) via "${strategy}" strategy`
    );

    // 3. Persist the chunk records
    const chunkRecords = await this.ragRepository.createChunks(
      document.id,
      textChunks.map((text, index) => ({
        content: text,
        chunkIndex: index,
        metadata: options.metadata,
      }))
    );

    // 4. Generate embeddings in batch
    const chunkTexts = chunkRecords.map(c => c.content);
    const embeddings = await this.embeddingService.embedTexts(chunkTexts);

    // 5. Store each embedding
    const storePromises = chunkRecords.map((chunk, index) => {
      const embedding = embeddings[index];
      if (!embedding) {
        this.logger.warn(`No embedding returned for chunk ${chunk.id} (index ${String(index)})`);
        return Promise.resolve();
      }
      return this.ragRepository.storeEmbedding(chunk.id, embedding);
    });

    await Promise.all(storePromises);

    const latencyMs = Date.now() - start;
    this.logger.log(
      `Ingested document ${document.id}: ${String(chunkRecords.length)} chunk(s), ` +
        `${String(embeddings.length)} embedding(s) in ${String(latencyMs)}ms`
    );

    return document;
  }

  // ─── Search ─────────────────────────────────────────────────────────────────

  /**
   * Semantic search across ingested documents.
   *
   * @param query     - Natural-language query
   * @param limit     - Maximum results (default: 5)
   * @param threshold - Minimum cosine similarity (0..1)
   */
  async search(query: string, limit?: number, threshold?: number): Promise<SearchResult[]> {
    return this.retrievalService.search(query, limit, threshold);
  }

  // ─── Document Management ────────────────────────────────────────────────────

  /**
   * Delete a document and all its chunks (cascade).
   */
  async deleteDocument(id: string): Promise<void> {
    await this.ragRepository.deleteDocument(id);
    this.logger.debug(`Deleted document ${id}`);
  }

  /**
   * List documents with pagination.
   */
  async listDocuments(
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ data: DocumentRecord[]; total: number }> {
    return this.ragRepository.findDocuments(page, pageSize);
  }
}
