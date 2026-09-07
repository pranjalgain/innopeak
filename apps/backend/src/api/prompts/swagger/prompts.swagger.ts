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
    ApiParam({ name: 'promptId', type: String, format: 'uuid' }),
    ApiBody({ type: CreatePromptVersionDto }),
    ApiResponse({
      status: HttpStatus.CREATED,
      description: 'Version appended',
      type: CreatePromptVersionResponseDto,
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
    ApiParam({ name: 'promptId', type: String, format: 'uuid' }),
    ApiBody({ type: UpdatePromptToneDto }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Tone updated',
      type: UpdatePromptToneResponseDto,
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid tone' }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Prompt not found for this tenant' })
  );
}
