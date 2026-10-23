import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';

/** Single fallback for `ERASURE_GRACE_PERIOD_DAYS` so the purge cron, user-facing messages and env schema cannot drift. */
export const DEFAULT_ERASURE_GRACE_PERIOD_DAYS = 21;

export function getErasureGracePeriodDays(configService: ConfigService<EnvConfig>): number {
  return (
    configService.get<number>('ERASURE_GRACE_PERIOD_DAYS') ?? DEFAULT_ERASURE_GRACE_PERIOD_DAYS
  );
}

/**
 * What an erased record's free text is replaced with, where a column cannot be NULL (a business or location name, a reply body, a
 * `platform_activity_log` address a CHECK requires). Recognisable as deliberate, never mistaken for real data.
 */
export const ERASED_PLACEHOLDER = '[erased]';

/** Reminder lead time; skipped when the grace period is not longer than this. */
export const ERASURE_REMINDER_DAYS_BEFORE = 3;
