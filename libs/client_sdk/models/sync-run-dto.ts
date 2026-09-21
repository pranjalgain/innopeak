// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface SyncRunDto {
  id: string;
  trigger: SyncRunDtoTriggerEnum;
  status: SyncRunDtoStatusEnum;
  startedAt: string;
  completedAt?: object | null;
  reviewsFetched?: object | null;
  errorMessage?: object | null;
}

export const SyncRunDtoTriggerEnum = {
  Scheduled: 'scheduled',
  Backfill: 'backfill',
} as const;

export type SyncRunDtoTriggerEnum =
  (typeof SyncRunDtoTriggerEnum)[keyof typeof SyncRunDtoTriggerEnum];
export const SyncRunDtoStatusEnum = {
  Running: 'running',
  Ok: 'ok',
  Error: 'error',
} as const;

export type SyncRunDtoStatusEnum =
  (typeof SyncRunDtoStatusEnum)[keyof typeof SyncRunDtoStatusEnum];
