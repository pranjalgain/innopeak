// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface PlatformSettingsResponseDto {
  /**
   * Whether the sign-in/sign-up screens offer the Microsoft SSO button.
   */
  ssoLoginEnabled: boolean;
  /**
   * Whether the sign-in/sign-up screens offer email/password.
   */
  passwordLoginEnabled: boolean;
  /**
   * Whether the sign-in/sign-up screens offer Google social sign-in.
   */
  socialLoginEnabled: boolean;
  /**
   * Whether a tenant owner\'s Settings > Members tab can send invites.
   */
  inviteMembersEnabled: boolean;
  /**
   * Whether billing exists in this deploy at all — new sign-ups get a Paid plan option, admins see the Billing dashboard, and Checkout/the Customer Portal are reachable. A pure reflection of the deploy-level PAYMENT_FEATURE_ENABLED env var (env.config.ts\'s own doc comment explains why there is deliberately no second, runtime-toggleable copy of this) — not stored on `platform_settings` and not writable through this API.
   */
  paymentFeatureEnabled: boolean;
}
