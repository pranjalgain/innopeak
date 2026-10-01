import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';

/** Fallback for `ERASURE_GRACE_PERIOD_DAYS` — the one env var read independently by
 *  `CronService.purgeErasureRequests` (the purge query itself), `TenantMembersService` and
 *  `AdminBusinessesService` (the user-facing "takes effect in N days" message), plus the Joi
 *  schema and the `EnvConfig` parse default in `env-config.module.ts`. Kept as one constant so
 *  every one of those `?? 21` fallbacks — and the frontend's own display copies of it — can never
 *  drift out of sync with each other. */
export const DEFAULT_ERASURE_GRACE_PERIOD_DAYS = 21;

/** `ConfigService.get<number>('ERASURE_GRACE_PERIOD_DAYS') ?? DEFAULT_ERASURE_GRACE_PERIOD_DAYS`,
 *  factored out so every reader shares one fallback instead of repeating the literal. */
export function getErasureGracePeriodDays(configService: ConfigService<EnvConfig>): number {
  return (
    configService.get<number>('ERASURE_GRACE_PERIOD_DAYS') ?? DEFAULT_ERASURE_GRACE_PERIOD_DAYS
  );
}
