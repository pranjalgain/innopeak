// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface BackfillSummaryDto {
  syncRunId: string;
  status: BackfillSummaryDtoStatusEnum;
  trigger: string;
  startedAt: string;
}

export const BackfillSummaryDtoStatusEnum = {
  Running: 'running',
  Ok: 'ok',
  Error: 'error',
} as const;

export type BackfillSummaryDtoStatusEnum =
  (typeof BackfillSummaryDtoStatusEnum)[keyof typeof BackfillSummaryDtoStatusEnum];
