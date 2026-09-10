// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface UpdatePromptToneResponseDto {
  promptId: string;
  tone: UpdatePromptToneResponseDtoToneEnum;
}

export const UpdatePromptToneResponseDtoToneEnum = {
  Friendly: 'friendly',
  Professional: 'professional',
  Formal: 'formal',
  Playful: 'playful',
  Empathetic: 'empathetic',
} as const;

export type UpdatePromptToneResponseDtoToneEnum =
  (typeof UpdatePromptToneResponseDtoToneEnum)[keyof typeof UpdatePromptToneResponseDtoToneEnum];
