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

// Exception messages are locale-tagged proxies resolved only by HttpExceptionFilter inside a request;
// outside one they print a debug toString, so resolve by hand.
function describeError(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const rawMessage =
      typeof response === 'object' && 'message' in response ? response.message : response;
    return renderMessage(rawMessage, 'en');
  }
  return error instanceof Error ? error.message : String(error);
}

const MOCK_BUSINESS_NAME = 'The Coffee House';

// Runs fixtures against DEFAULT_PROMPTS, not a tenant's saved template (the HTTP dry-run endpoint does that).
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
