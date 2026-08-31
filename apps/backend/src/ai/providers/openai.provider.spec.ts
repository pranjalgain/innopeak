const mockChatCompletionsCreate = jest.fn();
const mockEmbeddingsCreate = jest.fn();

jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCompletionsCreate } },
    embeddings: { create: mockEmbeddingsCreate },
  }))
);

import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { OpenAiProvider } from './openai.provider';

import type { ChatCompletionOptions, ToolDefinition } from '../interfaces/ai-provider.interface';

describe('OpenAiProvider', () => {
  let target: OpenAiProvider;
  let configService: { get: jest.Mock };

  const makeOpenAiResponse = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'chatcmpl-1',
    model: 'gpt-4o',
    choices: [
      {
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'Hello there', tool_calls: undefined },
      },
    ],
    usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    ...overrides,
  });

  beforeEach(async () => {
    mockChatCompletionsCreate.mockReset();
    mockEmbeddingsCreate.mockReset();
    configService = { get: jest.fn().mockReturnValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OpenAiProvider, { provide: ConfigService, useValue: configService }],
    }).compile();

    target = module.get(OpenAiProvider);
  });

  afterEach(() => jest.clearAllMocks());

  describe('name', () => {
    it('identifies itself as "openai"', () => {
      expect(target.name).toBe('openai');
    });
  });

  describe('chatCompletion', () => {
    it('maps messages, calls the OpenAI client, and normalises the response', async () => {
      mockChatCompletionsCreate.mockResolvedValue(makeOpenAiResponse());

      const options: ChatCompletionOptions = {
        messages: [
          { role: 'system', content: 'be concise' },
          { role: 'user', content: 'hi' },
        ],
      };

      const result = await target.chatCompletion(options);

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'be concise' },
            { role: 'user', content: 'hi' },
          ],
        })
      );
      expect(result).toEqual({
        content: 'Hello there',
        role: 'assistant',
        model: 'gpt-4o',
        usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12 },
        finishReason: 'stop',
      });
    });

    it('maps function tool calls into normalised tool calls', async () => {
      mockChatCompletionsCreate.mockResolvedValue(
        makeOpenAiResponse({
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call-1',
                    type: 'function',
                    function: { name: 'search', arguments: '{"query":"docs"}' },
                  },
                ],
              },
            },
          ],
        })
      );

      const tools: ToolDefinition[] = [
        { name: 'search', description: 'search things', parameters: { properties: {} } },
      ];

      const result = await target.chatCompletion({
        messages: [{ role: 'user', content: 'search for docs' }],
        tools,
      });

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              type: 'function',
              function: {
                name: 'search',
                description: 'search things',
                parameters: { properties: {} },
              },
            },
          ],
        })
      );
      expect(result.toolCalls).toEqual([
        { id: 'call-1', name: 'search', arguments: '{"query":"docs"}' },
      ]);
      expect(result.content).toBe('');
    });

    it('maps tool role messages with an empty tool_call_id placeholder', async () => {
      mockChatCompletionsCreate.mockResolvedValue(makeOpenAiResponse());

      await target.chatCompletion({
        messages: [
          { role: 'user', content: 'do a thing' },
          { role: 'tool', content: 'tool result payload' },
        ],
      });

      expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'do a thing' },
            { role: 'tool', content: 'tool result payload', tool_call_id: '' },
          ],
        })
      );
    });

    it('wraps and rethrows errors raised by the OpenAI SDK (e.g. auth errors)', async () => {
      mockChatCompletionsCreate.mockRejectedValue(new Error('401 Incorrect API key provided'));

      await expect(
        target.chatCompletion({ messages: [{ role: 'user', content: 'hi' }] })
      ).rejects.toThrow('OpenAI chatCompletion failed: 401 Incorrect API key provided');
    });

    it('wraps non-Error rejections with a generic message', async () => {
      mockChatCompletionsCreate.mockRejectedValue('unexpected failure');

      await expect(
        target.chatCompletion({ messages: [{ role: 'user', content: 'hi' }] })
      ).rejects.toThrow('OpenAI chatCompletion failed: Unknown OpenAI API error');
    });

    it('falls back to safe defaults when usage or choices are missing from the response', async () => {
      mockChatCompletionsCreate.mockResolvedValue({
        id: 'chatcmpl-2',
        model: 'gpt-4o',
        choices: [],
        usage: undefined,
      });

      const result = await target.chatCompletion({ messages: [{ role: 'user', content: 'hi' }] });

      expect(result).toEqual({
        content: '',
        role: 'assistant',
        model: 'gpt-4o',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        finishReason: 'stop',
      });
    });
  });

  describe('embed', () => {
    it('generates embeddings and normalises the response', async () => {
      mockEmbeddingsCreate.mockResolvedValue({
        model: 'text-embedding-3-small',
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { total_tokens: 6 },
      });

      const result = await target.embed({ input: 'hello world' });

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        input: 'hello world',
        model: 'text-embedding-3-small',
      });
      expect(result).toEqual({
        embeddings: [[0.1, 0.2, 0.3]],
        model: 'text-embedding-3-small',
        usage: { totalTokens: 6 },
      });
    });

    it('wraps and rethrows errors raised while generating embeddings', async () => {
      mockEmbeddingsCreate.mockRejectedValue(new Error('service unavailable'));

      await expect(target.embed({ input: 'hello world' })).rejects.toThrow(
        'OpenAI embed failed: service unavailable'
      );
    });
  });
});
