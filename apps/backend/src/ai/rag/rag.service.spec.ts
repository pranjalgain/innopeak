import { RagRepository } from '@db/repositories/ai/rag.repository';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';
import type { DocumentRecord, IngestDocumentOptions } from './interfaces/document.interface';
import { RagService } from './rag.service';
import { RetrievalService } from './retrieval.service';

describe('RagService', () => {
  let target: RagService;
  let ragRepository: {
    createDocument: jest.Mock;
    createChunks: jest.Mock;
    storeEmbedding: jest.Mock;
    deleteDocument: jest.Mock;
    findDocuments: jest.Mock;
  };
  let chunkingService: { chunk: jest.Mock };
  let embeddingService: { embedTexts: jest.Mock };
  let retrievalService: { search: jest.Mock };

  const document: DocumentRecord = {
    id: 'doc-1',
    title: 'Title',
    source: 'source',
    content: 'full content',
    metadata: null,
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    ragRepository = {
      createDocument: jest.fn(),
      createChunks: jest.fn(),
      storeEmbedding: jest.fn(),
      deleteDocument: jest.fn(),
      findDocuments: jest.fn(),
    };
    chunkingService = { chunk: jest.fn() };
    embeddingService = { embedTexts: jest.fn() };
    retrievalService = { search: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        { provide: RagRepository, useValue: ragRepository },
        { provide: ChunkingService, useValue: chunkingService },
        { provide: EmbeddingService, useValue: embeddingService },
        { provide: RetrievalService, useValue: retrievalService },
      ],
    }).compile();

    target = module.get(RagService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('ingestDocument', () => {
    const options: IngestDocumentOptions = {
      title: 'Title',
      source: 'source',
      content: 'some long content to chunk',
      metadata: { tag: 'demo' },
    };

    it('creates the document, chunks it, persists chunks and stores embeddings', async () => {
      ragRepository.createDocument.mockResolvedValue(document);
      chunkingService.chunk.mockReturnValue(['chunk a', 'chunk b']);
      const chunkRecords = [
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          content: 'chunk a',
          chunkIndex: 0,
          metadata: null,
          createdAt: new Date(),
        },
        {
          id: 'chunk-2',
          documentId: 'doc-1',
          content: 'chunk b',
          chunkIndex: 1,
          metadata: null,
          createdAt: new Date(),
        },
      ];
      ragRepository.createChunks.mockResolvedValue(chunkRecords);
      embeddingService.embedTexts.mockResolvedValue([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);
      ragRepository.storeEmbedding.mockResolvedValue(undefined);

      const result = await target.ingestDocument(options);

      expect(ragRepository.createDocument).toHaveBeenCalledWith({
        title: options.title,
        source: options.source,
        content: options.content,
        metadata: options.metadata,
      });
      expect(chunkingService.chunk).toHaveBeenCalledWith(options.content, 'recursive', 1000, 200);
      expect(ragRepository.createChunks).toHaveBeenCalledWith('doc-1', [
        { content: 'chunk a', chunkIndex: 0, metadata: options.metadata },
        { content: 'chunk b', chunkIndex: 1, metadata: options.metadata },
      ]);
      expect(embeddingService.embedTexts).toHaveBeenCalledWith(['chunk a', 'chunk b']);
      expect(ragRepository.storeEmbedding).toHaveBeenCalledTimes(2);
      expect(ragRepository.storeEmbedding).toHaveBeenNthCalledWith(1, 'chunk-1', [0.1, 0.2]);
      expect(ragRepository.storeEmbedding).toHaveBeenNthCalledWith(2, 'chunk-2', [0.3, 0.4]);
      expect(result).toBe(document);
    });

    it('respects custom chunking strategy, size and overlap options', async () => {
      ragRepository.createDocument.mockResolvedValue(document);
      chunkingService.chunk.mockReturnValue(['only chunk']);
      ragRepository.createChunks.mockResolvedValue([
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          content: 'only chunk',
          chunkIndex: 0,
          metadata: null,
          createdAt: new Date(),
        },
      ]);
      embeddingService.embedTexts.mockResolvedValue([[0.1]]);

      await target.ingestDocument({
        ...options,
        chunkingStrategy: 'fixed',
        chunkSize: 50,
        chunkOverlap: 5,
      });

      expect(chunkingService.chunk).toHaveBeenCalledWith(options.content, 'fixed', 50, 5);
    });

    it('skips embedding entirely when chunking produces zero chunks', async () => {
      ragRepository.createDocument.mockResolvedValue(document);
      chunkingService.chunk.mockReturnValue([]);

      const result = await target.ingestDocument(options);

      expect(ragRepository.createChunks).not.toHaveBeenCalled();
      expect(embeddingService.embedTexts).not.toHaveBeenCalled();
      expect(result).toBe(document);
    });

    it('skips storing an embedding for a chunk when none was returned', async () => {
      ragRepository.createDocument.mockResolvedValue(document);
      chunkingService.chunk.mockReturnValue(['chunk a', 'chunk b']);
      const chunkRecords = [
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          content: 'chunk a',
          chunkIndex: 0,
          metadata: null,
          createdAt: new Date(),
        },
        {
          id: 'chunk-2',
          documentId: 'doc-1',
          content: 'chunk b',
          chunkIndex: 1,
          metadata: null,
          createdAt: new Date(),
        },
      ];
      ragRepository.createChunks.mockResolvedValue(chunkRecords);
      // Only one embedding returned for two chunks
      embeddingService.embedTexts.mockResolvedValue([[0.1, 0.2]]);

      await target.ingestDocument(options);

      expect(ragRepository.storeEmbedding).toHaveBeenCalledTimes(1);
      expect(ragRepository.storeEmbedding).toHaveBeenCalledWith('chunk-1', [0.1, 0.2]);
    });
  });

  describe('search', () => {
    it('delegates to the retrieval service with the given parameters', async () => {
      retrievalService.search.mockResolvedValue([]);

      await target.search('query text', 10, 0.5);

      expect(retrievalService.search).toHaveBeenCalledWith('query text', 10, 0.5);
    });
  });

  describe('deleteDocument', () => {
    it('delegates deletion to the repository', async () => {
      ragRepository.deleteDocument.mockResolvedValue(undefined);

      await target.deleteDocument('doc-1');

      expect(ragRepository.deleteDocument).toHaveBeenCalledWith('doc-1');
    });
  });

  describe('listDocuments', () => {
    it('delegates pagination to the repository with defaults', async () => {
      ragRepository.findDocuments.mockResolvedValue({ data: [document], total: 1 });

      const result = await target.listDocuments();

      expect(ragRepository.findDocuments).toHaveBeenCalledWith(1, 20);
      expect(result).toEqual({ data: [document], total: 1 });
    });

    it('forwards custom page and pageSize', async () => {
      ragRepository.findDocuments.mockResolvedValue({ data: [], total: 0 });

      await target.listDocuments(3, 50);

      expect(ragRepository.findDocuments).toHaveBeenCalledWith(3, 50);
    });
  });
});
