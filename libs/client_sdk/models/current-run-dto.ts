// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface CurrentRunDto {
  id: string;
  trigger: CurrentRunDtoTriggerEnum;
  startedAt: string;
  isStale: boolean;
}

export const CurrentRunDtoTriggerEnum = {
  Scheduled: 'scheduled',
  Backfill: 'backfill',
} as const;

export type CurrentRunDtoTriggerEnum =
  (typeof CurrentRunDtoTriggerEnum)[keyof typeof CurrentRunDtoTriggerEnum];
