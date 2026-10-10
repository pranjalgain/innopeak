// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { AdminBusinessResponseDto } from './admin-business-response-dto';
// May contain unused imports in some cases
// @ts-ignore
import type { PaginationMetaDto } from './pagination-meta-dto';

export interface AdminBusinessListResponseDto {
  /**
   * Newest first.
   */
  businesses: Array<AdminBusinessResponseDto>;
  meta: PaginationMetaDto;
}
