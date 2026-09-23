// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface AdminOverviewStatsResponseDto {
  /**
   * Total tenants (businesses), across the whole platform.
   */
  businessCount: number;
  /**
   * Total non-anonymized users, across every tenant.
   */
  userCount: number;
  /**
   * Total reviews synced, across every tenant.
   */
  totalReviewsFetched: number;
  /**
   * Total replies actually posted to Google, across every tenant.
   */
  totalRepliesSent: number;
}
