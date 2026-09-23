// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface AdminSignupTrendPointResponseDto {
  /**
   * Calendar month, `YYYY-MM`, zero-padded.
   */
  monthKey: string;
  /**
   * Tenants created that month. Zero if none were.
   */
  count: number;
}
