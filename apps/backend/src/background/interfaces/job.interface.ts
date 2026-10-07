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

/** Deliberately not IOtpEmailJob: this isn't an OTP email. */
export interface IAdminInviteEmailJob extends IEmailJob {
  inviteLink: string;
  expiresIn?: string;
}

/** Same shape as IAdminInviteEmailJob but kept separate; the two invite flows are otherwise uncoupled. */
export interface IMemberInviteEmailJob extends IEmailJob {
  inviteLink: string;
  expiresIn?: string;
  /** Without it the email reads "a team": recipients invited by two businesses cannot tell the
   *  emails apart, and unattributed invites score worse with spam filters. */
  businessName: string;
}

export type ErasureNoticeKind = 'cancelled' | 'erased' | 'reminder' | 'scheduled';

/**
 * One job per recipient, rendered in their own language. The payload is self-contained: for
 * `erased`, recipients no longer exist in the database when the mail is sent.
 */
export interface IErasureNoticeEmailJob extends IEmailJob {
  kind: ErasureNoticeKind;
  businessName: string;
  /** The recipient's `users.locale`, `en` when they never chose one. */
  locale: 'de' | 'en';
  /** ISO 8601 erasure deadline. Absent for `cancelled`. */
  scheduledFor?: string;
  /** An owner can restore their own request by signing in; an admin's request cannot be restored that way. */
  requestedBy: 'admin' | 'owner';
  /**
   * How this recipient can undo it: `you` (they asked and have a password), `requester` (only the
   * other owner who asked can), or `support` (SSO-only owner, or not an owner's request).
   */
  restore: 'requester' | 'support' | 'you';
  loginUrl: string;
}

export interface IPurgeSkippedBusiness {
  name: string;
  /** Whole days past the erasure deadline (0 = due today). */
  daysOverdue: number;
  /** What stopped it — already truncated; shown to a platform admin, never to the business. */
  reason: string;
}

/** Operational alert for platform admins, one job per admin so each gets their own language. */
export interface IErasurePurgeAlertEmailJob extends IEmailJob {
  locale: 'de' | 'en';
  skipped: IPurgeSkippedBusiness[];
}

export interface ICronJob {
  jobType: CronJobName;
  data?: Record<string, unknown> | undefined;
  options?: {
    priority?: number;
    timestamp?: number;
  };
}

/** Fields every review-sync job needs, whichever trigger produced it. */
export interface IReviewSyncJob {
  tenantId: string;
  locationId: string;
  connectionId: string;
  externalAccountId: string;
  externalLocationId: string;
}

/**
 * A backfill job carries the `sync_runs` row acquired in the confirm-location request so that
 * response can return its id. A poll job omits it and acquires its own run when it executes,
 * since it can sit queued for a while.
 */
export interface IReviewBackfillJob extends IReviewSyncJob {
  /** Completion is a CAS against this row, so it must travel with the job. */
  syncRunId: string;
}

/**
 * Deliberately minimal: the worker looks up everything else (external ids, connection, current
 * response content) fresh, since a job can sit queued and that data can change underneath it.
 */
export interface IReviewPostJob {
  tenantId: string;
  reviewId: string;
  responseId: string;
  /** 1-based; absent on the first attempt. Set only when rescheduling after a transient provider failure. */
  attempt?: number;
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
