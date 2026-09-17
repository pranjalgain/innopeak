// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface AcceptMemberInviteDto {
  /**
   * The raw invite token from the accept-invite link — the same value the URL\'s `:token` segment carries.
   */
  token: string;
  /**
   * Leading/trailing whitespace is trimmed before validation.
   */
  name: string;
  /**
   * At least one uppercase letter, one lowercase letter, one digit, and one special character (any non-alphanumeric, non-whitespace character — `#`, `-`, `_`, `~`, … all count).
   */
  password: string;
}
