const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }))
);

import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { ClaudeAiProvider } from './claude.provider';

import type { ChatCompletionOptions, ToolDefinition } from '../interfaces/ai-provider.interface';

describe('ClaudeAiProvider', () => {
  let target: ClaudeAiProvider;
  let configService: { get: jest.Mock };

  const makeAnthropicResponse = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'msg_1',
    role: 'assistant',
    model: 'claude-sonnet-4-20250514',
    content: [{ type: 'text', text: 'Hello there' }],
    usage: { input_tokens: 10, output_tokens: 5 },
    stop_reason: 'end_turn',
    ...overrides,
  });

  beforeEach(async () => {
    mockCreate.mockReset();
    configService = { get: jest.fn().mockReturnValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClaudeAiProvider, { provide: ConfigService, useValue: configService }],
    }).compile();

    target = module.get(ClaudeAiProvider);
  });

  afterEach(() => jest.clearAllMocks());

  describe('name', () => {
    it('identifies itself as "claude"', () => {
      expect(target.name).toBe('claude');
    });
  });

  describe('chatCompletion', () => {
    it('maps messages, calls the Anthropic client, and normalises the response', async () => {
      mockCreate.mockResolvedValue(makeAnthropicResponse());

      const options: ChatCompletionOptions = {
        messages: [
          { role: 'system', content: 'be concise' },
          { role: 'user', content: 'hi' },
        ],
      };

      const result = await target.chatCompletion(options);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-20250514',
          system: 'be concise',
          messages: [{ role: 'user', content: 'hi' }],
        })
      );
      expect(result).toEqual({
        content: 'Hello there',
        role: 'assistant',
        model: 'claude-sonnet-4-20250514',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: 'end_turn',
      });
    });

    it('maps tool_use blocks into normalised tool calls', async () => {
      mockCreate.mockResolvedValue(
        makeAnthropicResponse({
          content: [
            { type: 'text', text: '' },
            { type: 'tool_use', id: 'call-1', name: 'search', input: { query: 'docs' } },
          ],
          stop_reason: 'tool_use',
        })
      );

      const tools: ToolDefinition[] = [
        { name: 'search', description: 'search things', parameters: { properties: {} } },
      ];

      const result = await target.chatCompletion({
        messages: [{ role: 'user', content: 'search for docs' }],
        tools,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              name: 'search',
              description: 'search things',
              input_schema: { type: 'object', properties: {} },
            },
          ],
        })
      );
      expect(result.toolCalls).toEqual([
        { id: 'call-1', name: 'search', arguments: JSON.stringify({ query: 'docs' }) },
      ]);
    });

    it('maps tool role messages to user messages since Anthropic has no tool role', async () => {
      mockCreate.mockResolvedValue(makeAnthropicResponse());

      await target.chatCompletion({
        messages: [
          { role: 'user', content: 'do a thing' },
          { role: 'tool', content: 'tool result payload' },
        ],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'do a thing' },
            { role: 'user', content: 'tool result payload' },
          ],
        })
      );
    });

    it('wraps and rethrows errors raised by the Anthropic SDK (e.g. rate limiting)', async () => {
      mockCreate.mockRejectedValue(new Error('rate_limit_error: 429 Too Many Requests'));

      await expect(
        target.chatCompletion({ messages: [{ role: 'user', content: 'hi' }] })
      ).rejects.toThrow('Claude chatCompletion failed: rate_limit_error: 429 Too Many Requests');
    });

    it('wraps non-Error rejections with a generic message', async () => {
      mockCreate.mockRejectedValue('unexpected failure');

      await expect(
        target.chatCompletion({ messages: [{ role: 'user', content: 'hi' }] })
      ).rejects.toThrow('Claude chatCompletion failed: Unknown Claude API error');
    });
  });

  describe('embed', () => {
    it('throws synchronously because Claude has no embeddings API', () => {
      // `embed` is declared `async`-looking in its return type but throws synchronously
      // rather than returning a rejected promise, so it must be invoked inside a callback.
      expect(() => target.embed({ input: 'text to embed' })).toThrow(
        'Claude (Anthropic) does not provide an embeddings API. Use OpenAI or another provider for embeddings.'
      );
    });
  });
});
