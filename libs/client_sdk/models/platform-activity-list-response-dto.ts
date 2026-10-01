// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { PaginationMetaDto } from './pagination-meta-dto';
// May contain unused imports in some cases
// @ts-ignore
import type { PlatformActivityResponseDto } from './platform-activity-response-dto';

export interface PlatformActivityListResponseDto {
  /**
   * Newest first.
   */
  activities: Array<PlatformActivityResponseDto>;
  meta: PaginationMetaDto;
}
