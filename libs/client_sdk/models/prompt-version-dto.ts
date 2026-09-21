// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { PromptCreatedByDto } from './prompt-created-by-dto';

export interface PromptVersionDto {
  id: string;
  version: number;
  template: string;
  createdAt: string;
  createdBy?: PromptCreatedByDto | null;
}
