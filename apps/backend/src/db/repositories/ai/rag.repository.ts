import { ChunkRecord, DocumentRecord, SearchResult } from '@ai/rag/interfaces/document.interface';
import { DBService } from '@db/db.service';
import { documentChunks, documents } from '@db/drizzle/schema';
import { Injectable, Logger } from '@nestjs/common';
import { count, desc, eq, sql } from 'drizzle-orm';

// ─── Insert Shapes ──────────────────────────────────────────────────────────

interface CreateDocumentData {
  title?: string | undefined;
  source?: string | undefined;
  content: string;
  metadata?: Record<string, unknown> | undefined;
}

interface CreateChunkData {
  content: string;
  chunkIndex: number;
  metadata?: unknown;
}

// ─── Raw SQL Row Shapes ─────────────────────────────────────────────────────

interface SimilarityRow {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: unknown;
  created_at: Date;
  score: number;
  doc_id: string;
  doc_title: string | null;
  doc_source: string | null;
  doc_content: string | null;
  doc_metadata: unknown;
  doc_created_at: Date;
}

@Injectable()
export class RagRepository {
  private readonly logger = new Logger(RagRepository.name);

  constructor(private readonly dbService: DBService) {}

  // ─── Documents ──────────────────────────────────────────────────────────────

  async createDocument(data: CreateDocumentData): Promise<DocumentRecord> {
    const rows = await this.dbService.db
      .insert(documents)
      .values({
        title: data.title ?? null,
        source: data.source ?? null,
        content: data.content,
        metadata: data.metadata ?? null,
      })
      .returning();

    const row = rows[0];
    if (!row) {
      throw new Error('Failed to insert document');
    }

    return this.mapDocumentRow(row);
  }

  async findDocumentById(id: string): Promise<DocumentRecord | null> {
    const rows = await this.dbService.db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return this.mapDocumentRow(row);
  }

  async deleteDocument(id: string): Promise<void> {
    // Chunks are cascade-deleted via the FK constraint on document_chunks.document_id
    await this.dbService.db.delete(documents).where(eq(documents.id, id));

    this.logger.debug(`Deleted document ${id} and its chunks`);
  }

  async findDocuments(
    page: number,
    pageSize: number
  ): Promise<{ data: DocumentRecord[]; total: number }> {
    const offset = (page - 1) * pageSize;

    const [totalResult, rows] = await Promise.all([
      this.dbService.db.select({ count: count() }).from(documents),
      this.dbService.db
        .select()
        .from(documents)
        .orderBy(desc(documents.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data: rows.map(row => this.mapDocumentRow(row)),
      total,
    };
  }

  // ─── Chunks ─────────────────────────────────────────────────────────────────

  async createChunks(documentId: string, chunks: CreateChunkData[]): Promise<ChunkRecord[]> {
    if (chunks.length === 0) {
      return [];
    }

    const values = chunks.map(chunk => ({
      documentId,
      content: chunk.content,
      chunkIndex: chunk.chunkIndex,
      metadata: chunk.metadata ?? null,
    }));

    const rows = await this.dbService.db.insert(documentChunks).values(values).returning();

    return rows.map(row => this.mapChunkRow(row));
  }

  // ─── Embeddings (pgvector raw SQL) ──────────────────────────────────────────

  async storeEmbedding(chunkId: string, embedding: number[]): Promise<void> {
    const vectorString = `[${embedding.join(',')}]`;

    await this.dbService.db.execute(
      sql`UPDATE document_chunks SET embedding = ${vectorString}::vector WHERE id = ${chunkId}`
    );
  }

  /**
   * Perform cosine similarity search using pgvector.
   *
   * Uses the `<=>` operator for cosine distance, then converts to similarity
   * score via `1 - distance`. Results are joined with the parent document.
   */
  async similaritySearch(
    embedding: number[],
    limit: number,
    threshold?: number
  ): Promise<SearchResult[]> {
    const vectorString = `[${embedding.join(',')}]`;
    const scoreThreshold = threshold ?? 0;

    const result = await this.dbService.db.execute(sql`
      SELECT
        dc.id,
        dc.document_id,
        dc.content,
        dc.chunk_index,
        dc.metadata,
        dc.created_at,
        1 - (dc.embedding <=> ${vectorString}::vector) AS score,
        d.id        AS doc_id,
        d.title     AS doc_title,
        d.source    AS doc_source,
        d.content   AS doc_content,
        d.metadata  AS doc_metadata,
        d.created_at AS doc_created_at
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      WHERE dc.embedding IS NOT NULL
        AND 1 - (dc.embedding <=> ${vectorString}::vector) >= ${scoreThreshold}
      ORDER BY dc.embedding <=> ${vectorString}::vector
      LIMIT ${limit}
    `);

    const rows = result.rows as unknown as SimilarityRow[];

    return rows.map(row => this.mapSimilarityRow(row));
  }

  // ─── Row Mappers ────────────────────────────────────────────────────────────

  private mapDocumentRow(row: {
    id: string;
    title: string | null;
    source: string | null;
    content: string | null;
    metadata: unknown;
    createdAt: Date;
  }): DocumentRecord {
    return {
      id: row.id,
      title: row.title,
      source: row.source,
      content: row.content,
      metadata: row.metadata,
      createdAt: row.createdAt,
    };
  }

  private mapChunkRow(row: {
    id: string;
    documentId: string;
    content: string;
    chunkIndex: number;
    metadata: unknown;
    createdAt: Date;
  }): ChunkRecord {
    return {
      id: row.id,
      documentId: row.documentId,
      content: row.content,
      chunkIndex: row.chunkIndex,
      metadata: row.metadata,
      createdAt: row.createdAt,
    };
  }

  private mapSimilarityRow(row: SimilarityRow): SearchResult {
    return {
      chunk: {
        id: row.id,
        documentId: row.document_id,
        content: row.content,
        chunkIndex: row.chunk_index,
        metadata: row.metadata,
        createdAt: row.created_at,
      },
      score: Number(row.score),
      document: {
        id: row.doc_id,
        title: row.doc_title,
        source: row.doc_source,
        content: row.doc_content,
        metadata: row.doc_metadata,
        createdAt: row.doc_created_at,
      },
    };
  }
}
