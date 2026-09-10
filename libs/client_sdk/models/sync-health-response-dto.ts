// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { CurrentRunDto } from './current-run-dto';

export interface SyncHealthResponseDto {
  locationId: string;
  healthy: boolean;
  locationStatus: SyncHealthResponseDtoLocationStatusEnum;
  connectionStatus: SyncHealthResponseDtoConnectionStatusEnum;
  lastSyncedAt?: object | null;
  lastSyncStatus?: SyncHealthResponseDtoLastSyncStatusEnum | null;
  lastSyncError?: object | null;
  livePollingEnabled: boolean;
  currentRun?: CurrentRunDto | null;
}

export const SyncHealthResponseDtoLocationStatusEnum = {
  Active: 'active',
  Inactive: 'inactive',
} as const;

export type SyncHealthResponseDtoLocationStatusEnum =
  (typeof SyncHealthResponseDtoLocationStatusEnum)[keyof typeof SyncHealthResponseDtoLocationStatusEnum];
export const SyncHealthResponseDtoConnectionStatusEnum = {
  Active: 'active',
  NeedsReauth: 'needs_reauth',
} as const;

export type SyncHealthResponseDtoConnectionStatusEnum =
  (typeof SyncHealthResponseDtoConnectionStatusEnum)[keyof typeof SyncHealthResponseDtoConnectionStatusEnum];
export const SyncHealthResponseDtoLastSyncStatusEnum = {
  Ok: 'ok',
  Error: 'error',
} as const;

export type SyncHealthResponseDtoLastSyncStatusEnum =
  (typeof SyncHealthResponseDtoLastSyncStatusEnum)[keyof typeof SyncHealthResponseDtoLastSyncStatusEnum];
