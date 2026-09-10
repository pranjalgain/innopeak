// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface RatingDistributionDto {
  /**
   * Review counts keyed by rating. Keys 1-5 are always present and zero-filled, so the client can render five bars without probing for absent buckets.
   */
  distribution: { [key: string]: number };
}
