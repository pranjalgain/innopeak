import {
  THROTTLER_LIMIT,
  THROTTLER_SKIP,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';

import { ConnectionsSyncController } from './connections-sync.controller';

import { BACKFILL_POLL_THROTTLE } from '../constants/connections.constants';

/**
 * `ThrottlerGuard` evaluates every configured tier per request, and `@Throttle` overrides only the
 * tiers it names. The onboarding progress poll asks for 120 req/min, which blows through the
 * global `medium` (100 / 5 min), `long` (500 / 30 min) and `very-long` (1000 / hr) tiers while an
 * import is still legitimately running — so those have to be explicitly skipped on this handler.
 *
 * Asserted against the reflected metadata rather than by firing requests at a live server: the
 * tiers are minutes-to-hours long, so an HTTP probe cannot distinguish "correctly skipped" from
 * "bucket happened to be empty" without waiting out the longest window.
 */
describe('ConnectionsSyncController throttling', () => {
  const getBackfill = ConnectionsSyncController.prototype.getBackfill;

  it('raises the short-tier budget to the poll rate', () => {
    expect(Reflect.getMetadata(`${THROTTLER_LIMIT}short`, getBackfill)).toBe(
      BACKFILL_POLL_THROTTLE.limit
    );
    expect(Reflect.getMetadata(`${THROTTLER_TTL}short`, getBackfill)).toBe(
      BACKFILL_POLL_THROTTLE.ttl
    );
  });

  it.each(['medium', 'long', 'very-long'])(
    'skips the %s tier, which would otherwise 429 a running import',
    tier => {
      expect(Reflect.getMetadata(`${THROTTLER_SKIP}${tier}`, getBackfill)).toBe(true);
    }
  );

  it('does not skip the short tier — that budget is the real limit for this route', () => {
    expect(Reflect.getMetadata(`${THROTTLER_SKIP}short`, getBackfill)).toBeUndefined();
  });

  /** The sibling routes are ordinary reads and must stay on the global tiers. */
  it.each(['getSyncHealth', 'listSyncRuns'] as const)('leaves %s on the global tiers', method => {
    const handler = ConnectionsSyncController.prototype[method];
    for (const tier of ['short', 'medium', 'long', 'very-long']) {
      expect(Reflect.getMetadata(`${THROTTLER_SKIP}${tier}`, handler)).toBeUndefined();
    }
  });
});
