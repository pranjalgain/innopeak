// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface UpgradeTrendPointResponseDto {
  /**
   * Calendar month, `YYYY-MM`, zero-padded.
   */
  monthKey: string;
  /**
   * Free-to-Paid checkouts completed that month, counted from stripe_webhook_events rows of type checkout.session.completed.
   */
  count: number;
}
