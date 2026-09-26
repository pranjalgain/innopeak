// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface BillingPlanDto {
  id: string;
  code: BillingPlanDtoCodeEnum;
  /**
   * null = unlimited
   */
  maxLocations: number | null;
  /**
   * null = unlimited
   */
  maxAiDraftsPerMonth: number | null;
  /**
   * null = unlimited
   */
  maxTeamMembers: number | null;
  customPromptsEnabled: boolean;
}

export const BillingPlanDtoCodeEnum = {
  Free: 'free',
  Paid: 'paid',
} as const;

export type BillingPlanDtoCodeEnum =
  (typeof BillingPlanDtoCodeEnum)[keyof typeof BillingPlanDtoCodeEnum];
