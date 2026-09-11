// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface UpdateTenantSettingsDto {
  /**
   * Reviews with rating strictly below this value escalate (low_rating). Not retroactive.
   */
  escalationRatingThreshold: number;
  /**
   * When true, an approved reply is posted without a second manual step. Approval is still required.
   */
  autoPostEnabled: boolean;
  /**
   * Months of reviewer PII retention. null or omitted stores NULL, which opts this tenant out of the nightly reviewer-retention purge entirely — there is no platform-default fallback. No product-level upper bound — a very large value is functionally \"keep indefinitely\" and is the tenant\'s call — but the column is a Postgres INTEGER, so a value past its own range reached the database as an uncaught 22003 and surfaced as a 500 rather than a 400.
   */
  reviewDataRetentionMonths?: number | null;
  /**
   * How many AI-drafted reply variants to generate per review — Settings’ AI tab.
   */
  aiReplyCount: number;
}
