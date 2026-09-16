// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { BackfillSummaryDto } from './backfill-summary-dto';

export interface ConfirmLocationResponseDto {
  id: string;
  connectionId: string;
  provider: ConfirmLocationResponseDtoProviderEnum;
  externalLocationId: string;
  name: string;
  address?: object | null;
  status: ConfirmLocationResponseDtoStatusEnum;
  lastSyncedAt?: object | null;
  lastSyncStatus?: ConfirmLocationResponseDtoLastSyncStatusEnum | null;
  lastSyncError?: object | null;
  onboardingBackfillCompletedAt?: object | null;
  createdAt: string;
  backfill?: BackfillSummaryDto | null;
  /**
   * True when a backfill was already running and this call reused it. The endpoint stays 201 and idempotent rather than 409, so a double-clicking owner still gets a locationId to poll.
   */
  backfillAlreadyRunning: boolean;
}

export const ConfirmLocationResponseDtoProviderEnum = {
  Google: 'google',
} as const;

export type ConfirmLocationResponseDtoProviderEnum =
  (typeof ConfirmLocationResponseDtoProviderEnum)[keyof typeof ConfirmLocationResponseDtoProviderEnum];
export const ConfirmLocationResponseDtoStatusEnum = {
  Active: 'active',
  Inactive: 'inactive',
} as const;

export type ConfirmLocationResponseDtoStatusEnum =
  (typeof ConfirmLocationResponseDtoStatusEnum)[keyof typeof ConfirmLocationResponseDtoStatusEnum];
export const ConfirmLocationResponseDtoLastSyncStatusEnum = {
  Ok: 'ok',
  Error: 'error',
} as const;

export type ConfirmLocationResponseDtoLastSyncStatusEnum =
  (typeof ConfirmLocationResponseDtoLastSyncStatusEnum)[keyof typeof ConfirmLocationResponseDtoLastSyncStatusEnum];
