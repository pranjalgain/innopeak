import { ApiProperty } from '@nestjs/swagger';
import { PROMPT_CATEGORIES, PROMPT_TONES } from '@prompts/constants/prompts.constants';
import type { PromptCategory, PromptTone } from '@prompts/types/prompt.type';

import type { GeneratedReply } from '../types/ai-reply-generation.type';

export class GenerateReplyDryRunResponseDto {
  @ApiProperty({
    example:
      "Thank you so much for the kind words, Jamie — we're thrilled you enjoyed the coffee and glad the team could make your visit feel personal. See you again soon!",
  })
  content!: string;

  @ApiProperty({
    description:
      'The model that actually served the request — OpenRouter can route a requested model to a different underlying one (e.g. a free-tier variant under load).',
    example: 'nvidia/nemotron-3-super-120b-a12b:free',
  })
  model!: string;

  @ApiProperty({
    nullable: true,
    example: 142,
    description: "Null when the provider's response didn't report usage accounting.",
  })
  promptTokens!: number | null;

  @ApiProperty({ nullable: true, example: 38 })
  completionTokens!: number | null;

  @ApiProperty({ description: 'The provider call alone, in milliseconds.', example: 1204 })
  latencyMs!: number;

  @ApiProperty({
    description:
      'Why the model stopped. Only `stop` means the reply is complete — `length` means it was cut off at the output-token cap and should not be treated as a usable draft.',
    nullable: true,
    example: 'stop',
  })
  finishReason!: string | null;

  @ApiProperty({ enum: PROMPT_CATEGORIES, example: 'positive' })
  category!: PromptCategory;

  @ApiProperty({
    description:
      "The tone actually used — the request's `toneOverride` if given, else the tenant's saved tone.",
    enum: PROMPT_TONES,
    example: 'professional',
  })
  tone!: PromptTone;

  @ApiProperty({
    description: "Whether `templateOverride` was used instead of the tenant's saved template.",
    example: false,
  })
  usedTemplateOverride!: boolean;

  static from(result: GeneratedReply): GenerateReplyDryRunResponseDto {
    const dto = new GenerateReplyDryRunResponseDto();
    dto.content = result.content;
    dto.model = result.model;
    dto.promptTokens = result.promptTokens;
    dto.completionTokens = result.completionTokens;
    dto.latencyMs = result.latencyMs;
    dto.finishReason = result.finishReason;
    dto.category = result.category;
    dto.tone = result.tone;
    dto.usedTemplateOverride = result.usedTemplateOverride;
    return dto;
  }
}
