// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface BackfillSummaryDto {
  syncRunId: string;
  status: BackfillSummaryDtoStatusEnum;
  trigger: BackfillSummaryDtoTriggerEnum;
  startedAt: string;
}

export const BackfillSummaryDtoStatusEnum = {
  Running: 'running',
  Ok: 'ok',
  Error: 'error',
} as const;

export type BackfillSummaryDtoStatusEnum =
  (typeof BackfillSummaryDtoStatusEnum)[keyof typeof BackfillSummaryDtoStatusEnum];
export const BackfillSummaryDtoTriggerEnum = {
  Scheduled: 'scheduled',
  Backfill: 'backfill',
} as const;

export type BackfillSummaryDtoTriggerEnum =
  (typeof BackfillSummaryDtoTriggerEnum)[keyof typeof BackfillSummaryDtoTriggerEnum];
