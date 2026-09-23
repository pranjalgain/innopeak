// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { PromptStatsBatchPairDto } from './prompt-stats-batch-pair-dto';

export interface GetPromptStatsBatchDto {
  /**
   * Every (promptId, version) pair to aggregate stats for, in one request — at most 100. A pair with no matching review_responses rows (or that does not exist) comes back with all-zero/null stats rather than an error.
   */
  pairs: Array<PromptStatsBatchPairDto>;
}
