// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface ConfirmLocationDto {
  /**
   * The provider\'s own location identifiers, taken from GET /v1/connections/google/available-locations. Re-validated server-side against the provider — never trusted from the client, since an arbitrary value would create a location row no poll can resolve.
   */
  externalLocationIds: Array<string>;
}
