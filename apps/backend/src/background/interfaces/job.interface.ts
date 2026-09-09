import type { CronJobName, QueueName } from '@bg/constants/job.constant';

export interface IEmailJob {
  email: string;
  customerName?: string;
}

export interface IOtpEmailJob extends IEmailJob {
  /** A string, not a number — a leading zero (e.g. "042913") is a real, significant digit. */
  otp: string;
  expiresIn?: string;
  passwordResetLink?: string;
  passwordSetLink?: string;
}

export interface ICronJob {
  jobType: CronJobName;
  data?: Record<string, unknown> | undefined;
  options?: {
    priority?: number;
    timestamp?: number;
  };
}

/** Fields every review-sync job needs, whichever trigger produced it — the base
 * `ReviewSyncQueueService.runPoll` and its shared helpers accept. */
export interface IReviewSyncJob {
  tenantId: string;
  locationId: string;
  connectionId: string;
  externalAccountId: string;
  externalLocationId: string;
}

/**
 * A backfill job additionally carries the `sync_runs` row `ConnectionsDbService.confirmLocation`
 * already acquired before publishing — acquired synchronously in the API request so the
 * confirm-location response can return its id immediately. A poll job has no such need and omits
 * it: `ReviewSyncQueueService.runPoll` acquires its own run when the job actually executes (via
 * `ReviewSyncDbService.acquireSyncRun`), since nothing needs the id before then and a BullMQ job
 * can sit queued for a while after `CronService.pollDueLocations` publishes it.
 */
export interface IReviewBackfillJob extends IReviewSyncJob {
  /** The `sync_runs` row this job owns. Completion is a CAS against it, so it must be carried. */
  syncRunId: string;
}

export interface IDLQFailedJobData {
  originalQueueName: QueueName;
  originalJobId: string;
  originalJobName: string;
  originalJobData: unknown;
  failedReason: string;
  stacktrace?: string[];
  timestamp: number;
}
