// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface DeleteAccountResponseDto {
  /**
   * When the business and its data are permanently erased unless restored first.
   */
  scheduledFor: string;
  /**
   * The grace period the deadline was computed from.
   */
  gracePeriodDays: number;
  /**
   * Whether the owner can restore it themselves (they have a password to sign in with). When false, restoring means contacting support.
   */
  canRestore: boolean;
}
