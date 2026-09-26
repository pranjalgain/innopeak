// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface ReviewsTrendPointResponseDto {
  /**
   * Calendar month, `YYYY-MM`, zero-padded.
   */
  monthKey: string;
  /**
   * Reviews synced that month. Zero if none were.
   */
  reviewsFetched: number;
  /**
   * Replies actually posted to Google that month (by post date, not draft date).
   */
  repliesSent: number;
}
