// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface UpdatePlatformSettingsDto {
  microsoftLoginEnabled?: boolean;
  passwordLoginEnabled?: boolean;
  googleLoginEnabled?: boolean;
  inviteMembersEnabled?: boolean;
  /**
   * Not implemented yet: `true` is refused with 422 NOTIFICATION_CHANNELS_NOT_IMPLEMENTED until email/Teams delivery exists.
   */
  notificationSettingsEnabled?: boolean;
  /**
   * Acknowledges that switching Microsoft or Google off locks out active tenant users who can only sign in with it. Without it that change is refused with 400 SSO_LOGIN_DISALLOWED_SSO_ONLY_USERS. Never stored; it applies to this request only.
   */
  confirmLockout?: boolean;
}
