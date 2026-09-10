// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface ConnectionLocationDto {
  id: string;
  provider: ConnectionLocationDtoProviderEnum;
  externalLocationId: string;
  /**
   * Alias of locations.name, matching the frontend\'s ConnectionInfo.businessName.
   */
  businessName: string;
  address?: object | null;
  status: ConnectionLocationDtoStatusEnum;
  lastSyncedAt?: object | null;
  lastSyncStatus?: ConnectionLocationDtoLastSyncStatusEnum | null;
  lastSyncError?: object | null;
  /**
   * NULL means live polling is still gated on the backfill finishing.
   */
  onboardingBackfillCompletedAt?: object | null;
}

export const ConnectionLocationDtoProviderEnum = {
  Google: 'google',
} as const;

export type ConnectionLocationDtoProviderEnum =
  (typeof ConnectionLocationDtoProviderEnum)[keyof typeof ConnectionLocationDtoProviderEnum];
export const ConnectionLocationDtoStatusEnum = {
  Active: 'active',
  Inactive: 'inactive',
} as const;

export type ConnectionLocationDtoStatusEnum =
  (typeof ConnectionLocationDtoStatusEnum)[keyof typeof ConnectionLocationDtoStatusEnum];
export const ConnectionLocationDtoLastSyncStatusEnum = {
  Ok: 'ok',
  Error: 'error',
} as const;

export type ConnectionLocationDtoLastSyncStatusEnum =
  (typeof ConnectionLocationDtoLastSyncStatusEnum)[keyof typeof ConnectionLocationDtoLastSyncStatusEnum];
