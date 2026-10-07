import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';

/** Single fallback for `ERASURE_GRACE_PERIOD_DAYS` so the purge cron, user-facing messages and env schema cannot drift. */
export const DEFAULT_ERASURE_GRACE_PERIOD_DAYS = 21;

export function getErasureGracePeriodDays(configService: ConfigService<EnvConfig>): number {
  return (
    configService.get<number>('ERASURE_GRACE_PERIOD_DAYS') ?? DEFAULT_ERASURE_GRACE_PERIOD_DAYS
  );
}

/** Reminder lead time; skipped when the grace period is not longer than this. */
export const ERASURE_REMINDER_DAYS_BEFORE = 3;
