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

/** `implements MockReviewInput` rather than the service declaring its own parallel copy of this
 *  shape — see `AiReplyGenerationService`'s own doc comment on `MockReviewInput` for why the
 *  domain type is the one both layers depend on. */
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
  // This route has no auth (see AiController's own doc comment), so there is no token to read a
  // tenantId off — a caller names one instead. Omitted, the controller falls back to the newest
  // tenant, which is what makes this still convenient on a single-tenant dev database.
  @ApiPropertyOptional({
    description:
      "Which tenant's saved prompts/tone to generate with. Omit on a single-tenant dev database and the newest tenant is used.",
    format: 'uuid',
    example: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0001',
  })
  @IsOptional()
  // Not version-pinned: every real id in this schema is uuidv7() (@IsUUID('4') rejected every
  // genuine tenantId, verified against the actual database — the field was silently unusable).
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
  @ValidateNested()
  @Type(() => MockReviewDto)
  review!: MockReviewDto;

  @ApiPropertyOptional({
    description:
      "Override the tenant's saved tone for this one call, without changing prompts.tone. Omitted, the tenant's current tone for `category` is used.",
    enum: PROMPT_TONES,
    example: 'friendly',
  })
  // `| null` is not decoration: `@IsOptional()` skips every other validator when the value is
  // null *or* undefined, so an explicit JSON `null` reaches this property untouched. Typing it
  // honestly is what lets `toServiceInput()` below treat it as "absent" — see that method.
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

  /** Maps this DTO's on-the-wire shape to the service's own input type — kept here (a `static
   *  from()`-style factory, per module-structure.md's own carve-out) rather than inlined in the
   *  controller, whose job is bind-and-delegate only. The conditional spreads are
   *  `exactOptionalPropertyTypes`'s own requirement: omitting an unset optional key, not assigning
   *  it `undefined`, is what this project's tsconfig demands everywhere else too (see
   *  `prompts.service.ts`'s identical pattern).
   *
   *  **`null` is normalized to "absent", not passed through.** `@IsOptional()` declares that null
   *  and undefined both mean "not provided" — it skips every other validator on both — so an
   *  explicit `{"templateOverride": null}` arrives here fully unvalidated. Forwarding that null
   *  into `GenerateDryRunReplyInput` (whose field is `string | undefined`) took the service's
   *  `templateOverride !== undefined` branch and handed `null` to `sanitizePromptTemplate`, which
   *  dereferences it — a 500 on input that should read as "no override given". Matching the
   *  decorator's own null-means-absent semantics here is what keeps that unreachable. */
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
