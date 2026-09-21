// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { AvailableLocationDto } from './available-location-dto';

export interface AvailableLocationsResponseDto {
  provider: AvailableLocationsResponseDtoProviderEnum;
  connectionId: string;
  locations: Array<AvailableLocationDto>;
}

export const AvailableLocationsResponseDtoProviderEnum = {
  Google: 'google',
} as const;

export type AvailableLocationsResponseDtoProviderEnum =
  (typeof AvailableLocationsResponseDtoProviderEnum)[keyof typeof AvailableLocationsResponseDtoProviderEnum];
