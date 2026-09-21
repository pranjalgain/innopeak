// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface LocationDto {
  id: string;
  connectionId: string;
  provider: LocationDtoProviderEnum;
  externalLocationId: string;
  name: string;
  address?: object | null;
  status: LocationDtoStatusEnum;
  lastSyncedAt?: object | null;
  lastSyncStatus?: LocationDtoLastSyncStatusEnum | null;
  lastSyncError?: object | null;
  onboardingBackfillCompletedAt?: object | null;
  createdAt: string;
}

export const LocationDtoProviderEnum = {
  Google: 'google',
} as const;

export type LocationDtoProviderEnum =
  (typeof LocationDtoProviderEnum)[keyof typeof LocationDtoProviderEnum];
export const LocationDtoStatusEnum = {
  Active: 'active',
  Inactive: 'inactive',
} as const;

export type LocationDtoStatusEnum =
  (typeof LocationDtoStatusEnum)[keyof typeof LocationDtoStatusEnum];
export const LocationDtoLastSyncStatusEnum = {
  Ok: 'ok',
  Error: 'error',
} as const;

export type LocationDtoLastSyncStatusEnum =
  (typeof LocationDtoLastSyncStatusEnum)[keyof typeof LocationDtoLastSyncStatusEnum];
