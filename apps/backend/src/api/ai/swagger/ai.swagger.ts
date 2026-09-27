import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { GenerateReplyDryRunResponseDto } from '../dto/generate-reply-dry-run-response.dto';
import { GenerateReplyDryRunDto } from '../dto/generate-reply-dry-run.dto';

const DRY_RUN_RESPONSE_EXAMPLE = {
  content:
    "Thank you so much for the kind words, Jamie — we're thrilled you enjoyed the coffee and glad the team could make your visit feel personal. See you again soon!",
  model: 'nvidia/nemotron-3-super-120b-a12b:free',
  promptTokens: 142,
  completionTokens: 38,
  latencyMs: 1204,
  finishReason: 'stop',
  category: 'positive',
  tone: 'professional',
  usedTemplateOverride: false,
};

export function ApiGenerateReplyDryRun(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Generate an AI reply for a mock review (dry run)',
      description:
        "No authentication — pass `tenantId` to pick whose prompts to use, or omit it to fall back to the newest tenant. Fills that tenant's prompt template for `category` with a caller-supplied mock review and calls the configured AI provider. Nothing is persisted — this never writes a `review_responses` row, so it never counts against the plan's monthly AI-draft limit, though that limit is still checked. For testing prompt/tone configuration and the AI provider itself, ahead of a real classification → generation pipeline.",
    }),
    ApiBody({
      type: GenerateReplyDryRunDto,
      examples: {
        positive: {
          summary: 'Short 5-star review',
          value: {
            category: 'positive',
            review: {
              reviewerName: 'Jamie L.',
              rating: 5,
              reviewText:
                'Amazing coffee and the staff remembered my order from last time! Will definitely be back.',
            },
          },
        },
        escalated: {
          summary: '1-star review with a tone override',
          value: {
            category: 'escalated',
            toneOverride: 'empathetic',
            review: {
              reviewerName: 'Anonymous',
              rating: 1,
              reviewText:
                'Waited over an hour for our order, the food arrived cold, and the manager was dismissive when I raised it.',
            },
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Reply generated',
      type: GenerateReplyDryRunResponseDto,
      examples: { default: { summary: 'Generated reply', value: DRY_RUN_RESPONSE_EXAMPLE } },
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: "Plan's monthly AI-draft limit reached",
    }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description:
        'No prompt configured for this category (`AI_PROMPT_NOT_CONFIGURED`); no tenant exists at all (`AI_DRY_RUN_NO_TENANT`, only when `tenantId` is omitted); or, from the shared billing entitlement check this route also runs, `SUBSCRIPTION_NOT_FOUND`/`PLAN_NOT_FOUND` on a tenant with no billing rows — see the error reference',
    }),
    ApiResponse({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      description: 'AI provider not configured (OPENROUTER_API_KEY/OPENROUTER_MODEL unset)',
    }),
    ApiResponse({
      status: HttpStatus.BAD_GATEWAY,
      description: 'The AI provider call itself failed',
    })
  );
}
