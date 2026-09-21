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
}
