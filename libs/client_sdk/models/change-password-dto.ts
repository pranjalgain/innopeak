// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface ChangePasswordDto {
  /**
   * The caller’s current password. Complexity is not re-checked — an older password that would fail today’s policy must still be accepted as proof of identity.
   */
  currentPassword: string;
  /**
   * At least one uppercase letter, one lowercase letter, one digit, and one special character (any non-alphanumeric, non-whitespace character — `#`, `-`, `_`, `~`, … all count).
   */
  newPassword: string;
}
