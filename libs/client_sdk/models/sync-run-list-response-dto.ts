// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { PaginationMetaDto } from './pagination-meta-dto';
// May contain unused imports in some cases
// @ts-ignore
import type { SyncRunDto } from './sync-run-dto';

export interface SyncRunListResponseDto {
  runs: Array<SyncRunDto>;
  /**
   * Nested inside data on purpose — TransformInterceptor rebuilds the response envelope and would drop a top-level meta.
   */
  meta: PaginationMetaDto;
}
