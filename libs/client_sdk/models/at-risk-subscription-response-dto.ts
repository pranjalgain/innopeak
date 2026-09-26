// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface AtRiskSubscriptionResponseDto {
  tenantId: string;
  businessName: string;
  status: AtRiskSubscriptionResponseDtoStatusEnum;
  /**
   * When the paid period Stripe last tried to renew was due to end.
   */
  currentPeriodEnd: string | null;
}

export const AtRiskSubscriptionResponseDtoStatusEnum = {
  Active: 'active',
  PastDue: 'past_due',
  Canceled: 'canceled',
  Incomplete: 'incomplete',
} as const;

export type AtRiskSubscriptionResponseDtoStatusEnum =
  (typeof AtRiskSubscriptionResponseDtoStatusEnum)[keyof typeof AtRiskSubscriptionResponseDtoStatusEnum];
