// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface SetPasswordDto {
  /**
   * At least one uppercase letter, one lowercase letter, one digit, and one special character (any non-alphanumeric, non-whitespace character — `#`, `-`, `_`, `~`, … all count).
   */
  newPassword: string;
  /**
   * The 6-digit code emailed to this account by POST /v1/auth/set-password/request-otp — proof of live mailbox control, since an access token alone is not (see Security considerations in the auth API reference).
   */
  otp: string;
}
