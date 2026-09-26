// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { ClassificationBreakdownPointResponseDto } from './classification-breakdown-point-response-dto';
// May contain unused imports in some cases
// @ts-ignore
import type { ConnectionHealthResponseDto } from './connection-health-response-dto';
// May contain unused imports in some cases
// @ts-ignore
import type { RatingDistributionPointResponseDto } from './rating-distribution-point-response-dto';
// May contain unused imports in some cases
// @ts-ignore
import type { ReviewsTrendPointResponseDto } from './reviews-trend-point-response-dto';

export interface AdminStatisticsSummaryResponseDto {
  /**
   * totalRepliesSent / totalReviewsFetched * 100.
   */
  replyRatePercent: number;
  /**
   * Average `reviews.rating` across every tenant.
   */
  avgRating: number;
  /**
   * Share of completed (non-`running`) sync_runs that ended `ok` rather than `error`, platform-wide.
   */
  syncSuccessRatePercent: number;
  connectionHealth: ConnectionHealthResponseDto;
  /**
   * Oldest month first, covering the trailing `months` window (see the query param).
   */
  reviewsTrend: Array<ReviewsTrendPointResponseDto>;
  /**
   * All five ratings always present, in ascending order, zero-filled where unused.
   */
  ratingDistribution: Array<RatingDistributionPointResponseDto>;
  /**
   * All three classifications always present, zero-filled where unused.
   */
  classificationBreakdown: Array<ClassificationBreakdownPointResponseDto>;
}
