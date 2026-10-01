// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface GenerateReplyDryRunResponseDto {
  content: string;
  /**
   * The model that actually served the request — OpenRouter can route a requested model to a different underlying one (e.g. a free-tier variant under load).
   */
  model: string;
  /**
   * Null when the provider\'s response didn\'t report usage accounting.
   */
  promptTokens: object | null;
  completionTokens: object | null;
  /**
   * The provider call alone, in milliseconds.
   */
  latencyMs: number;
  /**
   * Why the model stopped. Only `stop` means the reply is complete — `length` means it was cut off at the output-token cap and should not be treated as a usable draft.
   */
  finishReason: object | null;
  category: GenerateReplyDryRunResponseDtoCategoryEnum;
  /**
   * The tone actually used — the request\'s `toneOverride` if given, else the tenant\'s saved tone.
   */
  tone: GenerateReplyDryRunResponseDtoToneEnum;
  /**
   * Whether `templateOverride` was used instead of the tenant\'s saved template.
   */
  usedTemplateOverride: boolean;
}

export const GenerateReplyDryRunResponseDtoCategoryEnum = {
  Positive: 'positive',
  Neutral: 'neutral',
  Escalated: 'escalated',
} as const;

export type GenerateReplyDryRunResponseDtoCategoryEnum =
  (typeof GenerateReplyDryRunResponseDtoCategoryEnum)[keyof typeof GenerateReplyDryRunResponseDtoCategoryEnum];
export const GenerateReplyDryRunResponseDtoToneEnum = {
  Friendly: 'friendly',
  Professional: 'professional',
  Formal: 'formal',
  Playful: 'playful',
  Empathetic: 'empathetic',
} as const;

export type GenerateReplyDryRunResponseDtoToneEnum =
  (typeof GenerateReplyDryRunResponseDtoToneEnum)[keyof typeof GenerateReplyDryRunResponseDtoToneEnum];
