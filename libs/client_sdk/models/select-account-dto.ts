// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface SelectAccountDto {
  /**
   * One of the `accountId`s from `GET /v1/connections/google/accounts/pending`. Anything else is refused.
   */
  accountId: string;
}
