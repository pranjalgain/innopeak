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
import {
  CreatePromptVersionResponseDto,
  PromptListResponseDto,
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
