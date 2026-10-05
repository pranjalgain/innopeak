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

/** Published by AdminSettingsService.sendInvite — deliberately its own interface rather than
 *  reusing IOtpEmailJob's unused link fields, since this isn't an OTP email. */
export interface IAdminInviteEmailJob extends IEmailJob {
  inviteLink: string;
  expiresIn?: string;
}

/** Published by TenantMembersService.sendInvite — same shape as IAdminInviteEmailJob, kept as its
 *  own interface rather than shared since the two invite flows have no other coupling. */
export interface IMemberInviteEmailJob extends IEmailJob {
  inviteLink: string;
  expiresIn?: string;
  /** The tenant the invitee is being asked to join. Without it the email reads "a team", which is
   *  indistinguishable between senders — a recipient invited by two businesses cannot tell the two
   *  emails apart, and an unattributed invite scores worse with spam filters. */
  businessName: string;
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

/**
 * Published whenever something decides one `review_responses` row is ready to go out:
 * `ReviewsService.approveReply`'s auto-post step, the non-escalated auto-approve step in
 * `AiReplyGenerationService`, the manual `.../responses/:responseId/post` route, and `retry-post`.
 * Deliberately minimal — everything else the worker needs (the review's external ids, the tenant's
 * connection, the response's current content) is looked up fresh inside
 * `ReviewPostQueueService.postResponse` rather than carried in the payload, the same reasoning
 * `IReviewBackfillJob`'s own doc comment gives for re-reading a cursor rather than trusting one
 * baked into the job: a job can sit queued for a while, and this data can change underneath it.
 */
export interface IReviewPostJob {
  tenantId: string;
  reviewId: string;
  responseId: string;
  /** 1-based attempt number; absent on a first attempt. Only `ReviewPostQueueService` sets it,
   *  when it reschedules itself after a transient provider failure — see that class. */
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
