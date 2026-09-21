// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface SetAdminPasswordDto {
  /**
   * At least one uppercase letter, one lowercase letter, one digit, and one special character — same policy as `ChangeAdminPasswordDto.newPassword`.
   */
  newPassword: string;
  /**
   * The 6-digit code emailed to this admin by POST /v1/admin/settings/profile/set-password/request-otp — proof of live mailbox control, since an access token alone is not.
   */
  otp: string;
}
