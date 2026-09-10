// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { PromptCurrentVersionDto } from './prompt-current-version-dto';
// May contain unused imports in some cases
// @ts-ignore
import type { PromptVersionDto } from './prompt-version-dto';

export interface PromptDto {
  id: string;
  category: PromptDtoCategoryEnum;
  name: string;
  description: string;
  currentVersion: PromptCurrentVersionDto;
  /**
   * Live tenant-level tone on prompts.tone — not versioned.
   */
  tone: PromptDtoToneEnum;
  versionCount: number;
  createdAt: string;
  updatedAt: string;
  versions?: Array<PromptVersionDto>;
}

export const PromptDtoCategoryEnum = {
  Positive: 'positive',
  Neutral: 'neutral',
  Escalated: 'escalated',
} as const;

export type PromptDtoCategoryEnum =
  (typeof PromptDtoCategoryEnum)[keyof typeof PromptDtoCategoryEnum];
export const PromptDtoToneEnum = {
  Friendly: 'friendly',
  Professional: 'professional',
  Formal: 'formal',
  Playful: 'playful',
  Empathetic: 'empathetic',
} as const;

export type PromptDtoToneEnum =
  (typeof PromptDtoToneEnum)[keyof typeof PromptDtoToneEnum];
