// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface BillingWebhookEventResponseDto {
  /**
   * Stripe\'s own event id.
   */
  id: string;
  type: string;
  processedAt: string;
  /**
   * Null when this event is an orphan delivery — its Stripe customer id matches no tenant.
   */
  tenantId: string | null;
  businessName: string | null;
}
