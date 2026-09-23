import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';

import { CreatePromptVersionDto } from '../dto/create-prompt-version.dto';
import { GetPromptStatsBatchDto } from '../dto/get-prompt-stats-batch.dto';
import {
  CreatePromptVersionResponseDto,
  PromptListResponseDto,
  PromptStatsBatchResponseDto,
  PromptVersionStatsResponseDto,
  UpdatePromptToneResponseDto,
} from '../dto/prompt-response.dto';
import { UpdatePromptToneDto } from '../dto/update-prompt-tone.dto';

const PROMPT_ID_EXAMPLE = '0190f4a1-7c33-7e51-9a02-6d1b8f4c0011';

const PROMPT_VERSION_EXAMPLE = {
  id: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0aa1',
  version: 3,
  template:
    'You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.\n\nReview: "{{review_text}}"',
  createdAt: '2026-08-25T09:30:00.000Z',
  createdBy: { userId: '0190f3b2-1c44-7a10-8f31-2b7c9e5d0002', name: 'Jane Doe' },
};

const PROMPT_LIST_EXAMPLE = {
  prompts: [
    {
      id: PROMPT_ID_EXAMPLE,
      category: 'positive',
      name: 'Positive review reply',
      description: 'Used for 4-5 star reviews.',
      currentVersion: PROMPT_VERSION_EXAMPLE,
      tone: 'professional',
      versionCount: 3,
      createdAt: '2026-08-20T10:00:00.000Z',
      updatedAt: '2026-08-20T10:00:00.000Z',
    },
  ],
};

export function ApiListPrompts(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'List tenant prompts',
      description:
        'Returns every prompt for the caller tenant. includeHistory embeds versions oldest-first.',
    }),
    ApiQuery({
      name: 'includeHistory',
      required: false,
      type: Boolean,
      example: true,
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Prompt list',
      type: PromptListResponseDto,
      examples: { default: { summary: 'Tenant prompts', value: PROMPT_LIST_EXAMPLE } },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a tenant owner' })
  );
}

export function ApiCreatePromptVersion(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Append a prompt version',
      description:
        'Inserts a new prompt_versions row. Sanitizes the template, requires allowlisted {{placeholders}}, and rejects unchanged text.',
    }),
    ApiParam({ name: 'promptId', type: String, format: 'uuid', example: PROMPT_ID_EXAMPLE }),
    ApiBody({
      type: CreatePromptVersionDto,
      examples: {
        default: {
          summary: 'New template text',
          value: {
            template:
              'Thank you {{reviewer_name}} for the {{rating}}-star review of {{business_name}}! "{{review_text}}"',
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.CREATED,
      description: 'Version appended',
      type: CreatePromptVersionResponseDto,
      examples: {
        default: {
          summary: 'Version appended',
          value: {
            promptId: PROMPT_ID_EXAMPLE,
            version: PROMPT_VERSION_EXAMPLE,
            versionCount: 3,
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Validation, unknown placeholder, or missing required placeholder',
    }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Prompt not found for this tenant' }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      description: 'Unchanged template or version unique conflict',
    })
  );
}

export function ApiUpdatePromptTone(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Update prompt tone',
      description: 'Updates prompts.tone in place. Does not append a prompt_versions row.',
    }),
    ApiParam({ name: 'promptId', type: String, format: 'uuid', example: PROMPT_ID_EXAMPLE }),
    ApiBody({
      type: UpdatePromptToneDto,
      examples: { default: { summary: 'New tone', value: { tone: 'friendly' } } },
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Tone updated',
      type: UpdatePromptToneResponseDto,
      examples: {
        default: {
          summary: 'Tone updated',
          value: { promptId: PROMPT_ID_EXAMPLE, tone: 'friendly' },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid tone' }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Prompt not found for this tenant' })
  );
}

const PROMPT_VERSION_STATS_EXAMPLE = {
  totalGenerated: 42,
  approvedCount: 30,
  approvedAsIsCount: 21,
  approvedEditedCount: 9,
  rejectedCount: 4,
  pendingCount: 6,
  supersededCount: 2,
  averageDecisionMinutes: 12.5,
};

const SECOND_PROMPT_ID_EXAMPLE = '0190f4a1-7c33-7e51-9a02-6d1b8f4c0022';

export function ApiGetPromptStats(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Get prompt analytics',
      description:
        'Aggregates review_responses generated by a prompt into approval/edit/rejection counts and average decision time. Omitting the version query param aggregates every version of the prompt; ?version=N scopes to one. Computed server-side from a single query, rather than the frontend fetching full review rows to compute the same numbers.',
    }),
    ApiParam({ name: 'promptId', type: String, format: 'uuid', example: PROMPT_ID_EXAMPLE }),
    ApiQuery({
      name: 'version',
      required: false,
      type: Number,
      example: 3,
      description:
        'Scopes the aggregate to one prompt version. Omit to aggregate across every version.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Prompt stats',
      type: PromptVersionStatsResponseDto,
      examples: {
        default: { summary: 'Prompt analytics', value: PROMPT_VERSION_STATS_EXAMPLE },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a tenant owner' }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description:
        "PROMPT_NOT_FOUND — no prompt with this id for the caller's tenant (version omitted). " +
        'PROMPT_VERSION_NOT_FOUND — ?version=N names a version this prompt has never had.',
      examples: {
        promptNotFound: {
          summary: 'PROMPT_NOT_FOUND',
          value: { message: 'Prompt not found', code: 'PROMPT_NOT_FOUND' },
        },
        versionNotFound: {
          summary: 'PROMPT_VERSION_NOT_FOUND',
          value: { message: 'Prompt version not found', code: 'PROMPT_VERSION_NOT_FOUND' },
        },
      },
    })
  );
}

const PROMPT_STATS_BATCH_RESPONSE_EXAMPLE = {
  results: [
    { promptId: PROMPT_ID_EXAMPLE, version: 3, stats: PROMPT_VERSION_STATS_EXAMPLE },
    {
      promptId: SECOND_PROMPT_ID_EXAMPLE,
      version: 1,
      stats: {
        totalGenerated: 0,
        approvedCount: 0,
        approvedAsIsCount: 0,
        approvedEditedCount: 0,
        rejectedCount: 0,
        pendingCount: 0,
        supersededCount: 0,
        averageDecisionMinutes: null,
      },
    },
  ],
};

export function ApiGetPromptStatsBatch(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Get prompt analytics for many (promptId, version) pairs',
      description:
        'The batch counterpart to GET /v1/prompts/:promptId/stats — one grouped query for every pair given, instead of one request per prompt. A pair with no matching data (or that does not exist) comes back with all-zero/null stats rather than an error.',
    }),
    ApiBody({
      type: GetPromptStatsBatchDto,
      examples: {
        default: {
          summary: 'Two prompts, current version each',
          value: {
            pairs: [
              { promptId: PROMPT_ID_EXAMPLE, version: 3 },
              { promptId: SECOND_PROMPT_ID_EXAMPLE, version: 1 },
            ],
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Prompt stats per pair',
      type: PromptStatsBatchResponseDto,
      examples: {
        default: { summary: 'Batch analytics', value: PROMPT_STATS_BATCH_RESPONSE_EXAMPLE },
      },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation error' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a tenant owner' })
  );
}
