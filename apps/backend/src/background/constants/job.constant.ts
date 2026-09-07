export enum QueueName {
  EMAIL = 'email',
  DEAD_LETTER = 'dead-letter',
  CRON = 'cron',
  REVIEW_SYNC = 'review-sync',
}

export const QUEUE_LIST = Object.values(QueueName).filter((v): v is QueueName =>
  Object.values(QueueName).includes(v as QueueName)
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
  DLQ_FAILED_JOB = 'dlq_failed_job',
  /** One-time historical import, published after POST /v1/connections/locations commits. */
  REVIEW_BACKFILL = 'review-backfill',
}

export enum CronJobName {
  DAILY_MAIL = 'daily-mail',
  /** Purges used/expired verify_email codes and revoked/expired refresh tokens — see AuthDbService.purgeStaleTokens. */
  AUTH_TOKEN_CLEANUP = 'auth-token-cleanup',
}
