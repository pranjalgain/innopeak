import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

import { PROMPT_TEMPLATE_MAX_LENGTH, sanitizePromptTemplate } from '../constants/prompts.constants';

export class CreatePromptVersionDto {
  @ApiProperty({
    description:
      'New template text (max 1000). Sanitized then validated for required {{placeholders}}. Appends a version; never overwrites.',
    example:
      'You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.\n\nReview: "{{review_text}}"',
    minLength: 1,
    maxLength: PROMPT_TEMPLATE_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) => {
    return typeof value === 'string' ? sanitizePromptTemplate(value).trim() : value;
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(PROMPT_TEMPLATE_MAX_LENGTH)
  template!: string;
}
