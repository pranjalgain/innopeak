// ─── Database Records ────────────────────────────────────────────────────────

export interface DocumentRecord {
  id: string;
  title: string | null;
  source: string | null;
  content: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface ChunkRecord {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  metadata: unknown;
  createdAt: Date;
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchResult {
  chunk: ChunkRecord;
  score: number;
  document: DocumentRecord;
}

// ─── Ingestion Options ───────────────────────────────────────────────────────

export interface IngestDocumentOptions {
  title?: string;
  source?: string;
  content: string;
  metadata?: Record<string, unknown>;
  chunkingStrategy?: 'fixed' | 'paragraph' | 'recursive';
  chunkSize?: number;
  chunkOverlap?: number;
}
