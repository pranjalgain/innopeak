// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { PaymentMethodResponseDto } from './payment-method-response-dto';

export interface SubscriptionResponseDto {
  planCode: SubscriptionResponseDtoPlanCodeEnum;
  status: SubscriptionResponseDtoStatusEnum | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  /**
   * true while a canceled subscription is still inside its paid grace period — planCode stays \'paid\' with unlimited entitlements until the period actually ends.
   */
  cancelAtPeriodEnd: boolean;
  activeLocationCount: number;
  /**
   * null = unlimited
   */
  maxLocations: number | null;
  teamMemberCount: number;
  /**
   * null = unlimited
   */
  maxTeamMembers: number | null;
  aiDraftsUsedThisMonth: number;
  /**
   * null = unlimited
   */
  maxAiDraftsPerMonth: number | null;
  customPromptsEnabled: boolean;
  /**
   * null when there is no Stripe customer yet, or no card on file.
   */
  paymentMethod: PaymentMethodResponseDto | null;
}

export const SubscriptionResponseDtoPlanCodeEnum = {
  Free: 'free',
  Paid: 'paid',
} as const;

export type SubscriptionResponseDtoPlanCodeEnum =
  (typeof SubscriptionResponseDtoPlanCodeEnum)[keyof typeof SubscriptionResponseDtoPlanCodeEnum];
export const SubscriptionResponseDtoStatusEnum = {
  Active: 'active',
  PastDue: 'past_due',
  Canceled: 'canceled',
  Incomplete: 'incomplete',
} as const;

export type SubscriptionResponseDtoStatusEnum =
  (typeof SubscriptionResponseDtoStatusEnum)[keyof typeof SubscriptionResponseDtoStatusEnum];
