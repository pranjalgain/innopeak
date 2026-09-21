// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface SetActiveLocationDto {
  /**
   * This tenant\'s internal `locations.id` (from GET /v1/connections/locations), not the provider external id — becomes the business every member of the tenant sees on the Dashboard/Review Queue until an owner changes it again.
   */
  locationId: string;
}
