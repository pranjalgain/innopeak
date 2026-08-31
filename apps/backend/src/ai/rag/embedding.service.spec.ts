import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { EmbeddingService } from './embedding.service';

import { AiService } from '../ai.service';

describe('EmbeddingService', () => {
  let target: EmbeddingService;
  let aiService: { embed: jest.Mock };

  beforeEach(async () => {
    aiService = { embed: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [EmbeddingService, { provide: AiService, useValue: aiService }],
    }).compile();

    target = module.get(EmbeddingService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('embedText', () => {
    it('embeds a single string and returns the first embedding vector', async () => {
      const vector = [0.1, 0.2, 0.3];
      aiService.embed.mockResolvedValue({
        data: { embeddings: [vector], model: 'text-embedding-3-small', usage: { totalTokens: 5 } },
        provider: 'openai',
        model: 'text-embedding-3-small',
        usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 },
        latencyMs: 12,
      });

      const result = await target.embedText('hello world');

      expect(aiService.embed).toHaveBeenCalledWith({ input: 'hello world' });
      expect(result).toBe(vector);
    });

    it('throws when the AI service returns no embedding', async () => {
      aiService.embed.mockResolvedValue({
        data: { embeddings: [], model: 'text-embedding-3-small', usage: { totalTokens: 0 } },
        provider: 'openai',
        model: 'text-embedding-3-small',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latencyMs: 3,
      });

      await expect(target.embedText('hello')).rejects.toThrow(
        'No embedding returned from AI service'
      );
    });
  });

  describe('embedTexts', () => {
    it('returns an empty array without calling the AI service for empty input', async () => {
      const result = await target.embedTexts([]);

      expect(result).toEqual([]);
      expect(aiService.embed).not.toHaveBeenCalled();
    });

    it('embeds multiple texts in a single batch call, preserving order', async () => {
      const vectors = [
        [0.1, 0.2],
        [0.3, 0.4],
      ];
      aiService.embed.mockResolvedValue({
        data: { embeddings: vectors, model: 'text-embedding-3-small', usage: { totalTokens: 10 } },
        provider: 'openai',
        model: 'text-embedding-3-small',
        usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
        latencyMs: 20,
      });

      const texts = ['first chunk', 'second chunk'];
      const result = await target.embedTexts(texts);

      expect(aiService.embed).toHaveBeenCalledWith({ input: texts });
      expect(result).toBe(vectors);
    });

    it('propagates errors from the AI service', async () => {
      aiService.embed.mockRejectedValue(new Error('provider unavailable'));

      await expect(target.embedTexts(['a', 'b'])).rejects.toThrow('provider unavailable');
    });
  });
});
