// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface DeleteAccountDto {
  /**
   * The business\'s name, typed exactly — a deliberate confirmation, not a checkbox.
   */
  businessName: string;
  /**
   * Required for an owner who has a password; omitted by one who signed in with SSO.
   */
  password?: string;
  /**
   * The 6-digit code emailed by POST /v1/auth/delete-account/request-otp. Required for an owner without a password; ignored otherwise.
   */
  otp?: string;
}
