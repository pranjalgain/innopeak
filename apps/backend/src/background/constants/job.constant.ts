export enum QueueName {
  EMAIL = 'email',
  DEAD_LETTER = 'dead-letter',
  CRON = 'cron',
  REVIEW_SYNC = 'review-sync',
  REVIEW_POST = 'review-post',
}

export const QUEUE_LIST = Object.values(QueueName).filter((v): v is QueueName =>
  Object.values(QueueName).includes(v)
);

/** SQS queue URL env key, e.g. QueueName.DEAD_LETTER -> 'DEAD_LETTER_QUEUE_URL'; Terraform seeds the same keys (infra/floci/secrets.tf). */
export function getQueueUrlEnvKey(name: QueueName): string {
  return `${name.toUpperCase().replace(/-/g, '_')}_QUEUE_URL`;
}

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000 * 60,
  },
  removeOnComplete: {
    age: 60 * 60 * 24,
    count: 5000,
  },
  removeOnFail: {
    age: 60 * 60 * 24 * 7,
  },
};

export enum QueuePrefix {
  USER = 'user',
  SYSTEM = 'system',
  ADMIN = 'admin',
}

export enum JobName {
  OTP_EMAIL_VERIFICATION = 'email-otp-verification',
  /** Carries the invite link, never the raw token bare. */
  ADMIN_INVITE_EMAIL = 'admin-invite-email',
  /** Same shape as ADMIN_INVITE_EMAIL. */
  MEMBER_INVITE_EMAIL = 'member-invite-email',
  /** Same IOtpEmailJob shape/consumer as OTP_EMAIL_VERIFICATION; separate name so queue metrics/logs tell them apart. */
  ADMIN_SET_PASSWORD_OTP_EMAIL = 'admin-set-password-otp-email',
  /** One job per owner; `IErasureNoticeEmailJob.kind` tells scheduled/reminder/cancelled/erased apart. */
  ERASURE_NOTICE_EMAIL = 'erasure-notice-email',
  /** One per active platform admin when a nightly purge could not release some businesses. */
  ERASURE_PURGE_ALERT_EMAIL = 'erasure-purge-alert-email',
  /** One per owner when the Free plan's location cap paused some of the business's locations. */
  LOCATIONS_PAUSED_EMAIL = 'locations-paused-email',
  DLQ_FAILED_JOB = 'dlq_failed_job',
  /** One-time historical import, published after POST /v1/connections/locations commits. */
  REVIEW_BACKFILL = 'review-backfill',
  /** One per eligible location, fanned out every 15 minutes. */
  REVIEW_POLL = 'review-poll',
  REVIEW_POST = 'review-post',
}

export enum CronJobName {
  DAILY_MAIL = 'daily-mail',
  /** Purges used/expired verify_email codes and revoked/expired refresh tokens. */
  AUTH_TOKEN_CLEANUP = 'auth-token-cleanup',
  /** Enqueues a JobName.REVIEW_POLL job per eligible location. */
  REVIEW_SYNC_POLL = 'review-sync-poll',
  /** Nightly reviewer-PII retention purge. */
  REVIEWER_RETENTION_PURGE = 'reviewer-retention-purge',
  /** GDPR grace-period sweep (team-member removal + tenant erasure). */
  ERASURE_PURGE = 'erasure-purge',
  /** Safety net for a missed/delayed Stripe webhook. */
  BILLING_RECONCILIATION_SWEEP = 'billing-reconciliation-sweep',
}
