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

export interface IReviewBackfillJob {
  tenantId: string;
  locationId: string;
  /** The `sync_runs` row this job owns. Completion is a CAS against it, so it must be carried. */
  syncRunId: string;
  connectionId: string;
  externalAccountId: string;
  externalLocationId: string;
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
