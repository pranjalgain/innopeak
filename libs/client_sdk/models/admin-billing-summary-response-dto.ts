// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { AtRiskSubscriptionResponseDto } from './at-risk-subscription-response-dto';
// May contain unused imports in some cases
// @ts-ignore
import type { PostErasureChargeResponseDto } from './post-erasure-charge-response-dto';
// May contain unused imports in some cases
// @ts-ignore
import type { UpgradeTrendPointResponseDto } from './upgrade-trend-point-response-dto';

export interface AdminBillingSummaryResponseDto {
  /**
   * Tenants on the Free plan.
   */
  freeCount: number;
  /**
   * Tenants on the Paid plan.
   */
  paidCount: number;
  /**
   * Paid tenants with an active Stripe subscription.
   */
  activeCount: number;
  /**
   * Paid tenants whose latest Stripe invoice failed — Stripe\'s own retry is ongoing.
   */
  pastDueCount: number;
  /**
   * Subscriptions Stripe has fully ended.
   */
  canceledCount: number;
  /**
   * Subscriptions still finishing initial payment setup (e.g. 3DS pending).
   */
  incompleteCount: number;
  /**
   * Subscriptions with cancel_at_period_end=true — still Paid and billed, but will drop to Free once the current period ends.
   */
  cancelingCount: number;
  /**
   * Oldest month first, covering the trailing `months` window (see the query param).
   */
  upgradeTrend: Array<UpgradeTrendPointResponseDto>;
  /**
   * Past-due subscriptions, most recently updated first, capped at 10.
   */
  atRisk: Array<AtRiskSubscriptionResponseDto>;
  /**
   * Payments that succeeded after the business asked to be deleted and have not been marked handled — refund due, newest first, capped at 20.
   */
  postErasureCharges: Array<PostErasureChargeResponseDto>;
}
