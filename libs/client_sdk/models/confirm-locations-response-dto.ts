// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { ConfirmLocationResponseDto } from './confirm-location-response-dto';

export interface ConfirmLocationsResponseDto {
  /**
   * One entry per confirmed location, in the same order as the request.
   */
  locations: Array<ConfirmLocationResponseDto>;
}
