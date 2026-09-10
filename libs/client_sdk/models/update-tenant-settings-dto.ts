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
   * Months of reviewer PII retention. null or omitted stores NULL (platform default).
   */
  reviewDataRetentionMonths?: object | null;
  /**
   * How many AI-drafted reply variants to generate per review — Settings’ AI tab.
   */
  aiReplyCount: number;
}
