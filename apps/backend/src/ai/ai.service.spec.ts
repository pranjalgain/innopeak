import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AiService } from './ai.service';
import type {
  ChatCompletionOptions,
  ChatCompletionResult,
  EmbeddingOptions,
  EmbeddingResult,
} from './interfaces/ai-provider.interface';
import { ClaudeAiProvider } from './providers/claude.provider';
import { OpenAiProvider } from './providers/openai.provider';

describe('AiService', () => {
  let target: AiService;
  let configService: { get: jest.Mock };
  let claudeProvider: { name: string; chatCompletion: jest.Mock; embed: jest.Mock };
  let openaiProvider: { name: string; chatCompletion: jest.Mock; embed: jest.Mock };

  const chatResult = (model: string): ChatCompletionResult => ({
    content: 'hello there',
    role: 'assistant',
    model,
    usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
    finishReason: 'stop',
  });

  const embeddingResult = (model: string): EmbeddingResult => ({
    embeddings: [[0.1, 0.2, 0.3]],
    model,
    usage: { totalTokens: 6 },
  });

  const buildModule = async (defaultProvider?: string): Promise<void> => {
    configService = { get: jest.fn().mockReturnValue(defaultProvider) };
    claudeProvider = { name: 'claude', chatCompletion: jest.fn(), embed: jest.fn() };
    openaiProvider = { name: 'openai', chatCompletion: jest.fn(), embed: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: ConfigService, useValue: configService },
        { provide: ClaudeAiProvider, useValue: claudeProvider },
        { provide: OpenAiProvider, useValue: openaiProvider },
      ],
    }).compile();

    target = module.get(AiService);
  };

  afterEach(() => jest.clearAllMocks());

  describe('default provider resolution', () => {
    it('defaults to claude when AI_DEFAULT_PROVIDER is not configured', async () => {
      await buildModule(undefined);
      claudeProvider.chatCompletion.mockResolvedValue(chatResult('claude-x'));

      const response = await target.chatCompletion({ messages: [] });

      expect(configService.get).toHaveBeenCalledWith('AI_DEFAULT_PROVIDER');
      expect(claudeProvider.chatCompletion).toHaveBeenCalled();
      expect(response.provider).toBe('claude');
    });

    it('uses openai as the default provider when AI_DEFAULT_PROVIDER=openai', async () => {
      await buildModule('openai');
      openaiProvider.chatCompletion.mockResolvedValue(chatResult('gpt-4o'));

      const response = await target.chatCompletion({ messages: [] });

      expect(openaiProvider.chatCompletion).toHaveBeenCalled();
      expect(claudeProvider.chatCompletion).not.toHaveBeenCalled();
      expect(response.provider).toBe('openai');
    });

    it('falls back to claude for an unrecognised configured provider name', async () => {
      await buildModule('some-unknown-vendor');
      claudeProvider.chatCompletion.mockResolvedValue(chatResult('claude-x'));

      const response = await target.chatCompletion({ messages: [] });

      expect(response.provider).toBe('claude');
    });
  });

  describe('chatCompletion', () => {
    beforeEach(async () => buildModule(undefined));

    it('wraps the provider result with provider name, model, usage and latency', async () => {
      const result = chatResult('claude-x');
      claudeProvider.chatCompletion.mockResolvedValue(result);

      const options: ChatCompletionOptions = { messages: [{ role: 'user', content: 'hi' }] };
      const response = await target.chatCompletion(options);

      expect(claudeProvider.chatCompletion).toHaveBeenCalledWith(options);
      expect(response.data).toBe(result);
      expect(response.model).toBe('claude-x');
      expect(response.usage).toBe(result.usage);
      expect(typeof response.latencyMs).toBe('number');
    });

    it('allows overriding the provider explicitly for a single call', async () => {
      const result = chatResult('gpt-4o');
      openaiProvider.chatCompletion.mockResolvedValue(result);

      const response = await target.chatCompletion({ messages: [] }, 'openai');

      expect(openaiProvider.chatCompletion).toHaveBeenCalled();
      expect(claudeProvider.chatCompletion).not.toHaveBeenCalled();
      expect(response.provider).toBe('openai');
    });

    it('rethrows and logs provider errors', async () => {
      claudeProvider.chatCompletion.mockRejectedValue(new Error('provider exploded'));

      await expect(target.chatCompletion({ messages: [] })).rejects.toThrow('provider exploded');
    });

    it('throws for an unknown provider name', async () => {
      await expect(target.chatCompletion({ messages: [] }, 'does-not-exist')).rejects.toThrow(
        'Unknown AI provider "does-not-exist"'
      );
    });
  });

  describe('embed', () => {
    beforeEach(async () => buildModule(undefined));

    it('defaults to the openai provider since claude has no embeddings API', async () => {
      const result = embeddingResult('text-embedding-3-small');
      openaiProvider.embed.mockResolvedValue(result);

      const options: EmbeddingOptions = { input: 'some text' };
      const response = await target.embed(options);

      expect(openaiProvider.embed).toHaveBeenCalledWith(options);
      expect(claudeProvider.embed).not.toHaveBeenCalled();
      expect(response.provider).toBe('openai');
      expect(response.usage).toEqual({ promptTokens: 6, completionTokens: 0, totalTokens: 6 });
    });

    it('honours an explicit provider override', async () => {
      const result = embeddingResult('claude-embeddings');
      claudeProvider.embed.mockResolvedValue(result);

      await target.embed({ input: 'text' }, 'claude');

      expect(claudeProvider.embed).toHaveBeenCalled();
      expect(openaiProvider.embed).not.toHaveBeenCalled();
    });

    it('propagates errors from the embedding provider', async () => {
      openaiProvider.embed.mockRejectedValue(new Error('embedding failed'));

      await expect(target.embed({ input: 'text' })).rejects.toThrow('embedding failed');
    });
  });

  describe('structuredOutput', () => {
    beforeEach(async () => buildModule(undefined));

    it('injects a schema instruction as a system message ahead of the user messages', async () => {
      const result = chatResult('claude-x');
      claudeProvider.chatCompletion.mockResolvedValue(result);

      const response = await target.structuredOutput({
        messages: [{ role: 'user', content: 'give me json' }],
        schema: { type: 'object', properties: { a: { type: 'number' } } },
        schemaName: 'MySchema',
      });

      expect(claudeProvider.chatCompletion).toHaveBeenCalledTimes(1);
      const calledWith = claudeProvider.chatCompletion.mock.calls[0]?.[0] as ChatCompletionOptions;

      expect(calledWith.messages[0]).toEqual({
        role: 'system',
        content: expect.stringContaining('MySchema'),
      });
      expect(calledWith.messages[1]).toEqual({ role: 'user', content: 'give me json' });
      expect(response.data).toBe(result);
    });

    it('forwards an explicit model override and provider selection', async () => {
      const result = chatResult('gpt-4o');
      openaiProvider.chatCompletion.mockResolvedValue(result);

      await target.structuredOutput(
        { messages: [], schema: {}, schemaName: 'S', model: 'gpt-4o' },
        'openai'
      );

      expect(openaiProvider.chatCompletion).toHaveBeenCalledTimes(1);
      const calledWith = openaiProvider.chatCompletion.mock.calls[0]?.[0] as ChatCompletionOptions;
      expect(calledWith.model).toBe('gpt-4o');
    });

    it('omits the model field when none is provided', async () => {
      const result = chatResult('claude-x');
      claudeProvider.chatCompletion.mockResolvedValue(result);

      await target.structuredOutput({ messages: [], schema: {}, schemaName: 'S' });

      const calledWith = claudeProvider.chatCompletion.mock.calls[0]?.[0] as ChatCompletionOptions;
      expect(calledWith.model).toBeUndefined();
    });
  });
});
