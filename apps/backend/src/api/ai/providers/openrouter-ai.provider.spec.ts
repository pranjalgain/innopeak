import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';

const mockOpenAiInstance = {
  chat: { completions: { create: jest.fn() } },
};

jest.mock('openai', () => jest.fn().mockImplementation(() => mockOpenAiInstance));

import { OpenRouterAiProvider } from './openrouter-ai.provider';

import {
  AiGenerationFailedException,
  AiProviderNotConfiguredException,
} from '../exceptions/ai.exceptions';

function configServiceReturning(
  values: Record<string, string | undefined>
): ConfigService<EnvConfig> {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService<EnvConfig>;
}

describe('OpenRouterAiProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends the system/user prompts and returns the parsed completion', async () => {
    mockOpenAiInstance.chat.completions.create.mockResolvedValue({
      model: 'nvidia/nemotron-3-super-120b-a12b:free',
      choices: [{ message: { content: '  Thanks so much!  ' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 15 },
    });

    const target = new OpenRouterAiProvider(
      configServiceReturning({ OPENROUTER_API_KEY: 'sk-or-test', OPENROUTER_MODEL: 'some/model' })
    );

    const result = await target.generateReply({
      systemPrompt: 'Be nice.',
      userPrompt: 'Reply to this review.',
    });

    expect(mockOpenAiInstance.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'some/model',
        messages: [
          { role: 'system', content: 'Be nice.' },
          { role: 'user', content: 'Reply to this review.' },
        ],
        // Regression: a reasoning model spent the whole budget thinking and returned no reply.
        reasoning: { enabled: false },
      }),
      expect.objectContaining({ timeout: expect.any(Number) })
    );
    expect(result.content).toBe('Thanks so much!');
    expect(result.model).toBe('nvidia/nemotron-3-super-120b-a12b:free');
    expect(result.promptTokens).toBe(120);
    expect(result.completionTokens).toBe(15);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.finishReason).toBe('stop');
  });

  it("disables the SDK's own retries explicitly, so latency and wall clock stay bounded", async () => {
    // The SDK defaults to maxRetries: 2, which would fold silent failed attempts into `latencyMs`
    // and stretch a stuck request to ~3x the timeout.
    mockOpenAiInstance.chat.completions.create.mockResolvedValue({
      model: 'some/model',
      choices: [{ message: { content: 'Thanks!' }, finish_reason: 'stop' }],
    });

    const target = new OpenRouterAiProvider(
      configServiceReturning({ OPENROUTER_API_KEY: 'sk-or-test', OPENROUTER_MODEL: 'some/model' })
    );
    await target.generateReply({ systemPrompt: 's', userPrompt: 'u' });

    expect(mockOpenAiInstance.chat.completions.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ maxRetries: 0 })
    );
  });

  // A model whose reasoning is mandatory may refuse the "off" setting; the draft must still be produced.
  it('retries once without the reasoning field when the model rejects it with a 400', async () => {
    mockOpenAiInstance.chat.completions.create
      .mockRejectedValueOnce(
        Object.assign(new Error('400 reasoning cannot be disabled'), { status: 400 })
      )
      .mockResolvedValueOnce({
        model: 'some/model',
        choices: [{ message: { content: 'Thanks!' }, finish_reason: 'stop' }],
      });
    const target = new OpenRouterAiProvider(
      configServiceReturning({ OPENROUTER_API_KEY: 'sk-or-test', OPENROUTER_MODEL: 'some/model' })
    );

    const result = await target.generateReply({ systemPrompt: 's', userPrompt: 'u' });

    expect(result.content).toBe('Thanks!');
    const calls = mockOpenAiInstance.chat.completions.create.mock.calls as [
      Record<string, unknown>,
    ][];
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[0]).toHaveProperty('reasoning', { enabled: false });
    expect(calls[1]?.[0]).not.toHaveProperty('reasoning');
  });

  it.each([
    ['a 500', Object.assign(new Error('500 upstream'), { status: 500 })],
    // Regression: every 400 was retried, so a typo'd model made two failing calls and logged a misleading warning.
    [
      'a 400 that is not about reasoning',
      Object.assign(new Error('400 not a valid model ID'), { status: 400 }),
    ],
  ])('does not retry %s', async (_label, failure) => {
    mockOpenAiInstance.chat.completions.create.mockRejectedValue(failure);
    const target = new OpenRouterAiProvider(
      configServiceReturning({ OPENROUTER_API_KEY: 'sk-or-test', OPENROUTER_MODEL: 'some/model' })
    );

    await expect(
      target.generateReply({ systemPrompt: 's', userPrompt: 'u' })
    ).rejects.toBeDefined();

    expect(mockOpenAiInstance.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it('surfaces a truncated reply via finishReason rather than passing it off as complete', async () => {
    // A free reasoning model spent its whole output budget and returned valid-looking mid-sentence
    // text; `finish_reason` is the only signal the reply is unusable.
    mockOpenAiInstance.chat.completions.create.mockResolvedValue({
      model: 'some/model',
      choices: [
        {
          message: { content: 'We are so sorry about the wait and will make sure' },
          finish_reason: 'length',
        },
      ],
      usage: { prompt_tokens: 223, completion_tokens: 400 },
    });

    const target = new OpenRouterAiProvider(
      configServiceReturning({ OPENROUTER_API_KEY: 'sk-or-test', OPENROUTER_MODEL: 'some/model' })
    );
    const result = await target.generateReply({ systemPrompt: 's', userPrompt: 'u' });

    expect(result.finishReason).toBe('length');
    expect(result.content).toBe('We are so sorry about the wait and will make sure');
  });

  it('reports usage as null when the provider response omits it', async () => {
    mockOpenAiInstance.chat.completions.create.mockResolvedValue({
      model: 'some/model',
      choices: [{ message: { content: 'Thanks!' }, finish_reason: 'stop' }],
    });

    const target = new OpenRouterAiProvider(
      configServiceReturning({ OPENROUTER_API_KEY: 'sk-or-test', OPENROUTER_MODEL: 'some/model' })
    );
    const result = await target.generateReply({ systemPrompt: 's', userPrompt: 'u' });

    expect(result.promptTokens).toBeNull();
    expect(result.completionTokens).toBeNull();
  });

  it('throws AiProviderNotConfiguredException when OPENROUTER_API_KEY is unset, without ever constructing the client', async () => {
    const target = new OpenRouterAiProvider(
      configServiceReturning({ OPENROUTER_API_KEY: undefined, OPENROUTER_MODEL: 'some/model' })
    );

    await expect(
      target.generateReply({ systemPrompt: 's', userPrompt: 'u' })
    ).rejects.toBeInstanceOf(AiProviderNotConfiguredException);
    expect(mockOpenAiInstance.chat.completions.create).not.toHaveBeenCalled();
  });

  it('throws AiProviderNotConfiguredException when OPENROUTER_MODEL is unset', async () => {
    const target = new OpenRouterAiProvider(
      configServiceReturning({ OPENROUTER_API_KEY: 'sk-or-test', OPENROUTER_MODEL: '' })
    );

    await expect(
      target.generateReply({ systemPrompt: 's', userPrompt: 'u' })
    ).rejects.toBeInstanceOf(AiProviderNotConfiguredException);
  });

  it('wraps a provider-side failure as AiGenerationFailedException', async () => {
    mockOpenAiInstance.chat.completions.create.mockRejectedValue(new Error('upstream 500'));

    const target = new OpenRouterAiProvider(
      configServiceReturning({ OPENROUTER_API_KEY: 'sk-or-test', OPENROUTER_MODEL: 'some/model' })
    );

    await expect(
      target.generateReply({ systemPrompt: 's', userPrompt: 'u' })
    ).rejects.toBeInstanceOf(AiGenerationFailedException);
  });

  it('throws AiGenerationFailedException when the completion has no message content', async () => {
    mockOpenAiInstance.chat.completions.create.mockResolvedValue({
      model: 'some/model',
      choices: [{ message: { content: null }, finish_reason: 'content_filter' }],
    });

    const target = new OpenRouterAiProvider(
      configServiceReturning({ OPENROUTER_API_KEY: 'sk-or-test', OPENROUTER_MODEL: 'some/model' })
    );

    await expect(
      target.generateReply({ systemPrompt: 's', userPrompt: 'u' })
    ).rejects.toBeInstanceOf(AiGenerationFailedException);
  });
});
