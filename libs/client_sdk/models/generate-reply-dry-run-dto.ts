// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { MockReviewDto } from './mock-review-dto';

export interface GenerateReplyDryRunDto {
  /**
   * Which tenant\'s saved prompts/tone to generate with. Omit on a single-tenant dev database and the newest tenant is used.
   */
  tenantId?: string;
  /**
   * Which of the tenant\'s three prompts to generate from.
   */
  category: GenerateReplyDryRunDtoCategoryEnum;
  /**
   * The mock review to generate a reply for.
   */
  review: MockReviewDto;
  /**
   * Override the tenant\'s saved tone for this one call, without changing prompts.tone. Omitted, the tenant\'s current tone for `category` is used.
   */
  toneOverride?: GenerateReplyDryRunDtoToneOverrideEnum;
  /**
   * Test template text that hasn\'t been saved as a real prompt version yet, instead of the tenant\'s current saved template for `category`. Sanitized the same way `PromptsService.createVersion` sanitizes a saved one, but not itself checked for required {{placeholders}} — a dry run may deliberately omit one to see what the model does without it.
   */
  templateOverride?: object;
}

export const GenerateReplyDryRunDtoCategoryEnum = {
  Positive: 'positive',
  Neutral: 'neutral',
  Escalated: 'escalated',
} as const;

export type GenerateReplyDryRunDtoCategoryEnum =
  (typeof GenerateReplyDryRunDtoCategoryEnum)[keyof typeof GenerateReplyDryRunDtoCategoryEnum];
export const GenerateReplyDryRunDtoToneOverrideEnum = {
  Friendly: 'friendly',
  Professional: 'professional',
  Formal: 'formal',
  Playful: 'playful',
  Empathetic: 'empathetic',
} as const;

export type GenerateReplyDryRunDtoToneOverrideEnum =
  (typeof GenerateReplyDryRunDtoToneOverrideEnum)[keyof typeof GenerateReplyDryRunDtoToneOverrideEnum];
