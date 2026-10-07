import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PROMPT_CATEGORIES,
  PROMPT_TEMPLATE_MAX_LENGTH,
  PROMPT_TONES,
  sanitizePromptTemplate,
} from '@prompts/constants/prompts.constants';
import type { PromptCategory, PromptTone } from '@prompts/types/prompt.type';
import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import type { GenerateDryRunReplyInput, MockReviewInput } from '../types/ai-reply-generation.type';

export class MockReviewDto implements MockReviewInput {
  @ApiProperty({
    description: 'Reviewer display name — fills the {{reviewer_name}} placeholder.',
    example: 'Jamie L.',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reviewerName!: string;

  @ApiProperty({
    description:
      'Star rating (1-5) — fills {{rating}}. A real review would also drive which category the classification pipeline sends it to (PLAN.md §5); here the category is chosen directly instead, since no classifier feeds this route.',
    example: 5,
    minimum: 1,
    maximum: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty({
    description: 'The review body text — fills {{review_text}}.',
    example:
      'Amazing coffee and the staff remembered my order from last time! Will definitely be back.',
    maxLength: 5000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  reviewText!: string;
}

export class GenerateReplyDryRunDto {
  // No auth on this route, so the caller names the tenant; omitted, the controller uses the newest one.
  @ApiPropertyOptional({
    description:
      "Which tenant's saved prompts/tone to generate with. Omit on a single-tenant dev database and the newest tenant is used.",
    format: 'uuid',
    example: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0001',
  })
  @IsOptional()
  // Not version-pinned: every id in this schema is uuidv7(), which @IsUUID('4') rejects.
  @IsUUID(undefined, { message: 'tenantId must be a UUID' })
  tenantId?: string;

  @ApiProperty({
    description: "Which of the tenant's three prompts to generate from.",
    enum: PROMPT_CATEGORIES,
    example: 'positive',
  })
  @IsIn(PROMPT_CATEGORIES, { message: `category must be one of: ${PROMPT_CATEGORIES.join(', ')}` })
  category!: PromptCategory;

  @ApiProperty({ description: 'The mock review to generate a reply for.', type: MockReviewDto })
  // ValidateNested alone lets an absent value through (toServiceInput then 500s); IsDefined makes it a 400.
  @IsDefined({ message: 'review is required' })
  @ValidateNested()
  @Type(() => MockReviewDto)
  review!: MockReviewDto;

  @ApiPropertyOptional({
    description:
      "Override the tenant's saved tone for this one call, without changing prompts.tone. Omitted, the tenant's current tone for `category` is used.",
    enum: PROMPT_TONES,
    example: 'friendly',
  })
  // `| null` is real: @IsOptional() lets an explicit JSON null through untouched; toServiceInput() treats it as absent.
  @IsOptional()
  @IsIn(PROMPT_TONES, { message: `toneOverride must be one of: ${PROMPT_TONES.join(', ')}` })
  toneOverride?: PromptTone | null;

  @ApiPropertyOptional({
    description:
      "Test template text that hasn't been saved as a real prompt version yet, instead of the tenant's current saved template for `category`. Sanitized the same way `PromptsService.createVersion` sanitizes a saved one, but not itself checked for required {{placeholders}} — a dry run may deliberately omit one to see what the model does without it.",
    example:
      'Thank {{reviewer_name}} warmly for the {{rating}}-star review of {{business_name}} in one short sentence.',
    maxLength: PROMPT_TEMPLATE_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    return typeof value === 'string' ? sanitizePromptTemplate(value).trim() : value;
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(PROMPT_TEMPLATE_MAX_LENGTH)
  templateOverride?: string | null;

  /** Null overrides are dropped like undefined: forwarding null would reach sanitizePromptTemplate(null) and 500. */
  toServiceInput(): GenerateDryRunReplyInput {
    return {
      category: this.category,
      review: this.review,
      ...(this.templateOverride !== undefined && this.templateOverride !== null
        ? { templateOverride: this.templateOverride }
        : {}),
      ...(this.toneOverride !== undefined && this.toneOverride !== null
        ? { toneOverride: this.toneOverride }
        : {}),
    };
  }
}
