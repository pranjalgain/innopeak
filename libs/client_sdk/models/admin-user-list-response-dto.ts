// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { AdminUserResponseDto } from './admin-user-response-dto';
// May contain unused imports in some cases
// @ts-ignore
import type { PaginationMetaDto } from './pagination-meta-dto';

export interface AdminUserListResponseDto {
  /**
   * Newest first.
   */
  users: Array<AdminUserResponseDto>;
  meta: PaginationMetaDto;
}
