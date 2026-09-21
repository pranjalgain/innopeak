// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { ReviewListItemDto } from './review-list-item-dto';
// May contain unused imports in some cases
// @ts-ignore
import type { ReviewsMetaDto } from './reviews-meta-dto';

export interface ReviewListResponseDto {
  data: Array<ReviewListItemDto>;
  /**
   * Nested inside data — TransformInterceptor rebuilds the envelope and drops a top-level meta.
   */
  meta: ReviewsMetaDto;
}
