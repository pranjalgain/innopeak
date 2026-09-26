// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { BillingPlanDto } from './billing-plan-dto';

export interface BillingPlansResponseDto {
  plans: Array<BillingPlanDto>;
  currentPlanId: string;
}
