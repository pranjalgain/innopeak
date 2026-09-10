// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface UpdatePromptToneDto {
  /**
   * Tenant-level tone for this prompt. Updated in place; not versioned.
   */
  tone: UpdatePromptToneDtoToneEnum;
}

export const UpdatePromptToneDtoToneEnum = {
  Friendly: 'friendly',
  Professional: 'professional',
  Formal: 'formal',
  Playful: 'playful',
  Empathetic: 'empathetic',
} as const;

export type UpdatePromptToneDtoToneEnum =
  (typeof UpdatePromptToneDtoToneEnum)[keyof typeof UpdatePromptToneDtoToneEnum];
