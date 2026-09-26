// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface HasPaidTenantsResponseDto {
  /**
   * True while at least one tenant is on the Paid plan — independent of PAYMENT_FEATURE_ENABLED, which never retroactively affects an already-Paid tenant.
   */
  hasPaidTenants: boolean;
}
