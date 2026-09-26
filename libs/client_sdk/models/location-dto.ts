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
  /**
   * Set when a billing plan downgrade left this location over the plan\'s location cap — still a live, owned connection, just excluded from the 15-minute poll until a plan change or PUT /v1/billing/active-location clears it. Distinct from `status`: a paused location is still `active`, not `inactive` (that means the owner disconnected it).
   */
  billingPausedAt?: object | null;
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
