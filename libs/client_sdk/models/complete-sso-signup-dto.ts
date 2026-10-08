// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface CompleteSsoSignupDto {
  /**
   * An SSO provider returns a person, not a business, and `tenants.name` is NOT NULL — this is what the pending signup (the `sso_pending_signup` cookie set by the callback) has been waiting on. Always required: this endpoint only exists for the genuinely-new-signup case.
   */
  businessName: string;
}
