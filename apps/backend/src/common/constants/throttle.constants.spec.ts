import { BillingWebhooksController } from '@billing/controllers/billing-webhooks.controller';
import { HealthController } from '@health/health.controller';
import { MetricsController } from '@metrics/metrics.controller';

import { SKIP_ALL_THROTTLERS, THROTTLER_TIERS } from './throttle.constants';

// `@nestjs/throttler` stores each skip as `THROTTLER:SKIP<tierName>` metadata on the class.
const skipKey = (tier: string): string => `THROTTLER:SKIP${tier}`;

describe('SKIP_ALL_THROTTLERS', () => {
  it('names every registered tier', () => {
    expect(Object.keys(SKIP_ALL_THROTTLERS).sort()).toEqual(Object.values(THROTTLER_TIERS).sort());
  });

  it.each([
    ['the Stripe webhook', BillingWebhooksController],
    ['health', HealthController],
    ['metrics', MetricsController],
  ])('%s is skipped by every tier, not just `default`', (_name, controller) => {
    for (const tier of Object.values(THROTTLER_TIERS)) {
      expect(Reflect.getMetadata(skipKey(tier), controller)).toBe(true);
    }
  });
});
