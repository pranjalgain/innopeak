// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface BackfillProgressResponseDto {
  locationId: string;
  syncRunId?: object | null;
  status?: BackfillProgressResponseDtoStatusEnum | null;
  trigger?: object | null;
  startedAt?: object | null;
  completedAt?: object | null;
  reviewsFetched?: object | null;
  /**
   * sync_runs.reviews_total — null when the provider reported no total.
   */
  totalToImport?: object | null;
  /**
   * 0-100. Null whenever totalToImport is null or zero — never synthesized. The client shows an indeterminate bar rather than a fabricated percentage.
   */
  progress?: object | null;
  errorMessage?: object | null;
  /**
   * Running, with no progress written for over 30 minutes.
   */
  isStale: boolean;
  onboardingBackfillCompletedAt?: object | null;
  /**
   * The ONLY correct signal for advancing the UI to done. sync_runs.status = \"ok\" means the job finished; this means the poller is actually un-gated.
   */
  livePollingEnabled: boolean;
}

export const BackfillProgressResponseDtoStatusEnum = {
  Running: 'running',
  Ok: 'ok',
  Error: 'error',
} as const;

export type BackfillProgressResponseDtoStatusEnum =
  (typeof BackfillProgressResponseDtoStatusEnum)[keyof typeof BackfillProgressResponseDtoStatusEnum];
