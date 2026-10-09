// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface PendingAccountDto {
  /**
   * Send this back to select the account.
   */
  accountId: string;
  name?: object | null;
  /**
   * Google\'s account type: PERSONAL, LOCATION_GROUP, USER_GROUP or ORGANIZATION.
   */
  type?: object | null;
}
