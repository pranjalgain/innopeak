import {
  THROTTLER_LIMIT,
  THROTTLER_SKIP,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';

import { ConnectionsSyncController } from './connections-sync.controller';

import { BACKFILL_POLL_THROTTLE } from '../constants/connections.constants';

/**
 * `@Throttle` overrides only the tiers it names, and the 120 req/min onboarding poll would exhaust the
 * global medium/long/very-long tiers mid-import, so those must be skipped. Asserted via reflected
 * metadata: the tiers last minutes to hours, so an HTTP probe cannot tell "skipped" from "bucket empty".
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

  it.each(['getSyncHealth', 'listSyncRuns'] as const)('leaves %s on the global tiers', method => {
    const handler = ConnectionsSyncController.prototype[method];
    for (const tier of ['short', 'medium', 'long', 'very-long']) {
      expect(Reflect.getMetadata(`${THROTTLER_SKIP}${tier}`, handler)).toBeUndefined();
    }
  });
});
