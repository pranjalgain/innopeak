import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import { PROMPT_TONES, type PromptToneValue } from '../constants/prompts.constants';

export class UpdatePromptToneDto {
  @ApiProperty({
    description: 'Tenant-level tone for this prompt. Updated in place; not versioned.',
    enum: PROMPT_TONES,
    example: 'professional',
  })
  @IsIn(PROMPT_TONES)
  tone!: PromptToneValue;
}
