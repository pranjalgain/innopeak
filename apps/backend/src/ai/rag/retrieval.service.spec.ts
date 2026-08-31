import { RagRepository } from '@db/repositories/ai/rag.repository';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { EmbeddingService } from './embedding.service';
import type { SearchResult } from './interfaces/document.interface';
import { RetrievalService } from './retrieval.service';

describe('RetrievalService', () => {
  let target: RetrievalService;
  let ragRepository: { similaritySearch: jest.Mock };
  let embeddingService: { embedText: jest.Mock };

  const buildResult = (id: string, score: number, metadata: unknown = {}): SearchResult => ({
    chunk: {
      id,
      documentId: 'doc-1',
      content: `content for ${id}`,
      chunkIndex: 0,
      metadata,
      createdAt: new Date('2026-01-01'),
    },
    score,
    document: {
      id: 'doc-1',
      title: 'Title',
      source: 'source',
      content: 'full document content',
      metadata: null,
      createdAt: new Date('2026-01-01'),
    },
  });

  beforeEach(async () => {
    ragRepository = { similaritySearch: jest.fn() };
    embeddingService = { embedText: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetrievalService,
        { provide: RagRepository, useValue: ragRepository },
        { provide: EmbeddingService, useValue: embeddingService },
      ],
    }).compile();

    target = module.get(RetrievalService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('search', () => {
    it('embeds the query and delegates to the repository with defaults', async () => {
      embeddingService.embedText.mockResolvedValue([0.1, 0.2, 0.3]);
      const results = [buildResult('chunk-1', 0.9)];
      ragRepository.similaritySearch.mockResolvedValue(results);

      const response = await target.search('what is nestjs?');

      expect(embeddingService.embedText).toHaveBeenCalledWith('what is nestjs?');
      expect(ragRepository.similaritySearch).toHaveBeenCalledWith([0.1, 0.2, 0.3], 5, undefined);
      expect(response).toBe(results);
    });

    it('forwards an explicit limit and threshold', async () => {
      embeddingService.embedText.mockResolvedValue([0.5]);
      ragRepository.similaritySearch.mockResolvedValue([]);

      await target.search('query', 10, 0.75);

      expect(ragRepository.similaritySearch).toHaveBeenCalledWith([0.5], 10, 0.75);
    });

    it('returns an empty array when there are no matches', async () => {
      embeddingService.embedText.mockResolvedValue([0.1]);
      ragRepository.similaritySearch.mockResolvedValue([]);

      const response = await target.search('no matches expected');

      expect(response).toEqual([]);
    });

    it('propagates embedding failures', async () => {
      embeddingService.embedText.mockRejectedValue(new Error('embedding failed'));

      await expect(target.search('bad query')).rejects.toThrow('embedding failed');
      expect(ragRepository.similaritySearch).not.toHaveBeenCalled();
    });
  });

  describe('searchWithMetadataFilter', () => {
    it('over-fetches candidates and applies the metadata filter, capping at limit', async () => {
      embeddingService.embedText.mockResolvedValue([0.1]);
      const candidates = [
        buildResult('chunk-1', 0.9, { lang: 'en' }),
        buildResult('chunk-2', 0.8, { lang: 'fr' }),
        buildResult('chunk-3', 0.7, { lang: 'en' }),
        buildResult('chunk-4', 0.6, { lang: 'en' }),
      ];
      ragRepository.similaritySearch.mockResolvedValue(candidates);

      const filter = (metadata: unknown): boolean => (metadata as { lang?: string }).lang === 'en';

      const response = await target.searchWithMetadataFilter('query', filter, 2);

      // limit * 3 = 6 requested from the repository
      expect(ragRepository.similaritySearch).toHaveBeenCalledWith([0.1], 6, undefined);
      expect(response).toHaveLength(2);
      expect(response.every(r => (r.chunk.metadata as { lang: string }).lang === 'en')).toBe(true);
    });

    it('returns an empty array when nothing matches the filter', async () => {
      embeddingService.embedText.mockResolvedValue([0.1]);
      ragRepository.similaritySearch.mockResolvedValue([
        buildResult('chunk-1', 0.9, { lang: 'de' }),
      ]);

      const response = await target.searchWithMetadataFilter(
        'query',
        metadata => (metadata as { lang?: string }).lang === 'en'
      );

      expect(response).toEqual([]);
    });
  });
});
