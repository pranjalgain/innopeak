// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { PromptVersionStatsResponseDto } from './prompt-version-stats-response-dto';

export interface PromptStatsBatchItemDto {
  promptId: string;
  version: number;
  stats: PromptVersionStatsResponseDto;
}
