export enum QueueName {
  EMAIL = 'email',
  DEAD_LETTER = 'dead-letter',
  CRON = 'cron',
  REVIEW_SYNC = 'review-sync',
}

export const QUEUE_LIST = Object.values(QueueName).filter((v): v is QueueName =>
  Object.values(QueueName).includes(v)
);

/**
 * The env var key holding an SQS queue's URL when DEPLOYMENT_TARGET=aws, e.g.
 * QueueName.DEAD_LETTER ('dead-letter') -> 'DEAD_LETTER_QUEUE_URL'. Terraform seeds these keys
 * into Secrets Manager with the same transform (see infra/floci/secrets.tf).
 */
export function getQueueUrlEnvKey(name: QueueName): string {
  return `${name.toUpperCase().replace(/-/g, '_')}_QUEUE_URL`;
}

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000 * 60, // 1 min. between retries
  },
  removeOnComplete: {
    age: 60 * 60 * 24, // ⏳ Keep for 1 day
    count: 5000, // max entries to keep
  },
  removeOnFail: {
    age: 60 * 60 * 24 * 7, // ⏳ Keep for 7 days
  },
};

export enum QueuePrefix {
  USER = 'user',
  SYSTEM = 'system',
  ADMIN = 'admin',
}

export enum JobName {
  OTP_EMAIL_VERIFICATION = 'email-otp-verification',
  /** Published by AdminSettingsService.sendInvite — carries the invite link, never the raw token bare. */
  ADMIN_INVITE_EMAIL = 'admin-invite-email',
  /** Published by TenantMembersService.sendInvite — same shape as ADMIN_INVITE_EMAIL. */
  MEMBER_INVITE_EMAIL = 'member-invite-email',
  /** Published by AdminSettingsService.requestSetPasswordOtp — same IOtpEmailJob shape/consumer
   *  as OTP_EMAIL_VERIFICATION, just a distinct job name so the two are distinguishable in queue
   *  metrics/logs. */
  ADMIN_SET_PASSWORD_OTP_EMAIL = 'admin-set-password-otp-email',
  DLQ_FAILED_JOB = 'dlq_failed_job',
  /** One-time historical import, published after POST /v1/connections/locations commits. */
  REVIEW_BACKFILL = 'review-backfill',
  /** One per eligible location, fanned out by CronService.pollDueLocations every 15 minutes. */
  REVIEW_POLL = 'review-poll',
}

export enum CronJobName {
  DAILY_MAIL = 'daily-mail',
  /** Purges used/expired verify_email codes and revoked/expired refresh tokens — see AuthDbService.purgeStaleTokens. */
  AUTH_TOKEN_CLEANUP = 'auth-token-cleanup',
  /** Enqueues a JobName.REVIEW_POLL job per eligible location — see CronService.pollDueLocations. */
  REVIEW_SYNC_POLL = 'review-sync-poll',
  /** PLAN.md §6's nightly reviewer-retention purge — see CronService.purgeExpiredReviewerPii. */
  REVIEWER_RETENTION_PURGE = 'reviewer-retention-purge',
  /** GDPR erasure grace-period sweep (team-member removal + tenant erasure) — see
   *  CronService.purgeErasureRequests. */
  ERASURE_PURGE = 'erasure-purge',
}
