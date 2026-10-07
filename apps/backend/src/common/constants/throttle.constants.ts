/**
 * Named tiers registered in `app.module.ts`. A bare `@SkipThrottle()` only skips a tier named
 * `default`, which this app lacks, so use `SKIP_ALL_THROTTLERS` for routes that must never be rate
 * limited (Stripe webhook, health, metrics).
 */
export const THROTTLER_TIERS = {
  SHORT: 'short',
  MEDIUM: 'medium',
  LONG: 'long',
  VERY_LONG: 'very-long',
} as const;

export const SKIP_ALL_THROTTLERS: Record<string, boolean> = Object.fromEntries(
  Object.values(THROTTLER_TIERS).map(name => [name, true])
);
