import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';

const mockOpenAiConstructor = jest.fn();
const mockOpenAiInstance = {
  chat: { completions: { create: jest.fn() } },
};

jest.mock('openai', () =>
  jest.fn().mockImplementation((...args: unknown[]) => {
    mockOpenAiConstructor(...args);
    return mockOpenAiInstance;
  })
);

import { AzureOpenAiProvider } from './azure-openai.provider';

import {
  AiGenerationFailedException,
  AiProviderNotConfiguredException,
} from '../exceptions/ai.exceptions';

const REAL_CONFIG = {
  AZURE_OPENAI_ENDPOINT: 'https://acme.openai.azure.com',
  AZURE_OPENAI_API_KEY: 'azure-key',
  AZURE_OPENAI_DEPLOYMENT: 'gpt-4o-reply',
  AZURE_OPENAI_API_VERSION: '2024-10-21',
  AZURE_OPENAI_REGION: 'westeurope',
};

function configServiceReturning(
  values: Record<string, string | undefined>
): ConfigService<EnvConfig> {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService<EnvConfig>;
}

describe('AzureOpenAiProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends the system/user prompts and returns the parsed completion, against the real endpoint', async () => {
    mockOpenAiInstance.chat.completions.create.mockResolvedValue({
      model: 'gpt-4o-reply',
      choices: [{ message: { content: '  Thanks so much!  ' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 15 },
    });

    const target = new AzureOpenAiProvider(configServiceReturning(REAL_CONFIG));
    const result = await target.generateReply({
      systemPrompt: 'Be nice.',
      userPrompt: 'Reply to this review.',
    });

    expect(mockOpenAiConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'azure-key',
        baseURL: 'https://acme.openai.azure.com/openai/deployments/gpt-4o-reply',
        defaultQuery: { 'api-version': '2024-10-21' },
        defaultHeaders: { 'api-key': 'azure-key' },
      })
    );
    expect(mockOpenAiInstance.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-reply',
        messages: [
          { role: 'system', content: 'Be nice.' },
          { role: 'user', content: 'Reply to this review.' },
        ],
      }),
      expect.objectContaining({ timeout: expect.any(Number), maxRetries: 0 })
    );
    expect(result.content).toBe('Thanks so much!');
    expect(result.promptTokens).toBe(120);
    expect(result.completionTokens).toBe(15);
    expect(result.finishReason).toBe('stop');
  });

  it('strips a trailing slash from AZURE_OPENAI_ENDPOINT before building the deployment path', async () => {
    mockOpenAiInstance.chat.completions.create.mockResolvedValue({
      model: 'gpt-4o-reply',
      choices: [{ message: { content: 'Thanks!' }, finish_reason: 'stop' }],
    });

    const target = new AzureOpenAiProvider(
      configServiceReturning({
        ...REAL_CONFIG,
        AZURE_OPENAI_ENDPOINT: 'https://acme.openai.azure.com/',
      })
    );
    await target.generateReply({ systemPrompt: 's', userPrompt: 'u' });

    expect(mockOpenAiConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://acme.openai.azure.com/openai/deployments/gpt-4o-reply',
      })
    );
  });

  it('throws AiProviderNotConfiguredException when AZURE_OPENAI_REGION is not westeurope, before ever constructing the client', async () => {
    const target = new AzureOpenAiProvider(
      configServiceReturning({ ...REAL_CONFIG, AZURE_OPENAI_REGION: 'eastus' })
    );

    await expect(
      target.generateReply({ systemPrompt: 's', userPrompt: 'u' })
    ).rejects.toBeInstanceOf(AiProviderNotConfiguredException);
    expect(mockOpenAiConstructor).not.toHaveBeenCalled();
  });

  it.each(Object.keys(REAL_CONFIG).filter(key => key !== 'AZURE_OPENAI_REGION'))(
    'throws AiProviderNotConfiguredException when %s is unset, without ever constructing the client',
    async key => {
      const target = new AzureOpenAiProvider(
        configServiceReturning({ ...REAL_CONFIG, [key]: undefined })
      );

      await expect(
        target.generateReply({ systemPrompt: 's', userPrompt: 'u' })
      ).rejects.toBeInstanceOf(AiProviderNotConfiguredException);
      expect(mockOpenAiConstructor).not.toHaveBeenCalled();
    }
  );

  it('wraps a provider-side failure as AiGenerationFailedException', async () => {
    mockOpenAiInstance.chat.completions.create.mockRejectedValue(new Error('upstream 500'));

    const target = new AzureOpenAiProvider(configServiceReturning(REAL_CONFIG));

    await expect(
      target.generateReply({ systemPrompt: 's', userPrompt: 'u' })
    ).rejects.toBeInstanceOf(AiGenerationFailedException);
  });

  it('throws AiGenerationFailedException when the completion has no message content', async () => {
    mockOpenAiInstance.chat.completions.create.mockResolvedValue({
      model: 'gpt-4o-reply',
      choices: [{ message: { content: null }, finish_reason: 'content_filter' }],
    });

    const target = new AzureOpenAiProvider(configServiceReturning(REAL_CONFIG));

    await expect(
      target.generateReply({ systemPrompt: 's', userPrompt: 'u' })
    ).rejects.toBeInstanceOf(AiGenerationFailedException);
  });

  describe('local mock server override', () => {
    it('redirects at the mock server and needs no real Azure config at all', async () => {
      mockOpenAiInstance.chat.completions.create.mockResolvedValue({
        model: 'mock-deployment',
        choices: [{ message: { content: 'Thanks for the feedback!' }, finish_reason: 'stop' }],
      });

      const target = new AzureOpenAiProvider(
        configServiceReturning({
          USE_LOCAL_MOCK_SERVER: 'true',
          LOCAL_MOCK_SERVER_URL: 'http://localhost:4100',
        })
      );
      const result = await target.generateReply({ systemPrompt: 's', userPrompt: 'u' });

      expect(mockOpenAiConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:4100/azure-openai/deployments/mock-deployment',
        })
      );
      expect(result.content).toBe('Thanks for the feedback!');
    });

    it('still uses AZURE_OPENAI_DEPLOYMENT as the path segment when one happens to be set alongside the mock flag', async () => {
      mockOpenAiInstance.chat.completions.create.mockResolvedValue({
        model: 'gpt-4o-reply',
        choices: [{ message: { content: 'Thanks!' }, finish_reason: 'stop' }],
      });

      const target = new AzureOpenAiProvider(
        configServiceReturning({
          USE_LOCAL_MOCK_SERVER: 'true',
          LOCAL_MOCK_SERVER_URL: 'http://localhost:4100',
          AZURE_OPENAI_DEPLOYMENT: 'gpt-4o-reply',
        })
      );
      await target.generateReply({ systemPrompt: 's', userPrompt: 'u' });

      expect(mockOpenAiConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:4100/azure-openai/deployments/gpt-4o-reply',
        })
      );
    });
  });
});
