import 'dotenv/config';
import { renderMessage } from '@common/i18n/message-registry';
import type { EnvConfig } from '@config/env.config';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_PROMPT_TONE, DEFAULT_PROMPTS } from '@prompts/constants/default-prompts.constant';

/* eslint-disable no-console -- standalone CLI script, no Nest Logger/DI context available */

import { MOCK_REVIEW_FIXTURES } from '../constants/mock-review-fixtures.constant';
import { OpenRouterAiProvider } from '../providers/openrouter-ai.provider';
import { buildSystemPrompt, fillPromptTemplate } from '../utils/prompt-template.util';

/**
 * `AiPromptNotConfiguredException`/`AiProviderNotConfiguredException`/etc. carry a `message` that
 * is a locale-tagged proxy object (`@common/i18n/message-registry`), only ever resolved to real
 * text by `HttpExceptionFilter` inside a live request — which this standalone script never goes
 * through. Left unhandled, `error.message` prints that proxy's own debug `toString()`
 * (`"i18n AI.PROVIDER_NOT_CONFIGURED"`) instead of readable English, so this resolves it by hand.
 */
function describeError(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const rawMessage =
      typeof response === 'object' && 'message' in response ? response.message : response;
    return renderMessage(rawMessage, 'en');
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * A quick, DB-free dev loop for "what does OpenRouter actually send back" — run this instead of
 * `POST /v1/ai/dry-run` when you just want to see raw provider output/latency/token counts
 * without a running server, a signed-in tenant, or a real prompt saved in the database. Reads
 * `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` straight from `.env` and runs every fixture in
 * `MOCK_REVIEW_FIXTURES` against that category's *default* template (`DEFAULT_PROMPTS` — the same
 * copy every new tenant is seeded with), not a tenant-specific one; the HTTP dry-run endpoint is
 * what exercises a real tenant's own saved template/tone instead.
 *
 * Usage: `pnpm ai:dry-run` (see package.json).
 */

const MOCK_BUSINESS_NAME = 'The Coffee House';

async function main(): Promise<void> {
  const configService = new ConfigService<EnvConfig>(process.env);
  const provider = new OpenRouterAiProvider(configService);

  console.log(`Running ${MOCK_REVIEW_FIXTURES.length} mock reviews through the AI provider...\n`);

  for (const fixture of MOCK_REVIEW_FIXTURES) {
    const defaultPrompt = DEFAULT_PROMPTS.find(prompt => prompt.category === fixture.category);
    if (defaultPrompt === undefined) {
      console.error(
        `No default template for category "${fixture.category}" — skipping "${fixture.key}".`
      );
      continue;
    }

    const userPrompt = fillPromptTemplate(defaultPrompt.template, {
      business_name: MOCK_BUSINESS_NAME,
      reviewer_name: fixture.reviewerName,
      rating: String(fixture.rating),
      review_text: fixture.reviewText,
    });
    const systemPrompt = buildSystemPrompt(DEFAULT_PROMPT_TONE);

    console.log('─'.repeat(72));
    console.log(`[${fixture.key}] ${fixture.description}`);
    console.log(
      `  category: ${fixture.category} | rating: ${fixture.rating} | reviewer: ${fixture.reviewerName}`
    );
    console.log(`  review:   "${fixture.reviewText}"`);

    try {
      const result = await provider.generateReply({ systemPrompt, userPrompt });
      console.log(`  reply:    "${result.content}"`);
      console.log(
        `  model: ${result.model} | latency: ${result.latencyMs}ms | tokens: ${
          result.promptTokens ?? '?'
        } in / ${result.completionTokens ?? '?'} out | finish: ${result.finishReason ?? '?'}${
          result.finishReason !== null && result.finishReason !== 'stop'
            ? '  <-- INCOMPLETE, reply was cut off'
            : ''
        }`
      );
    } catch (error: unknown) {
      console.error(`  FAILED: ${describeError(error)}`);
    }
    console.log('');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
