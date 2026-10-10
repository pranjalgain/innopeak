import type { BillingEntitlementsService } from './billing-entitlements.service';
import { FreePlanCapStartup } from './free-plan-cap.startup';

describe('FreePlanCapStartup', () => {
  // Regression guard: dropping or renaming this hook would silently stop re-applying the Free cap.
  it('re-applies the Free location cap when the API starts', async () => {
    const reapplyFreeLocationCap = jest.fn().mockResolvedValue(2);
    const startup = new FreePlanCapStartup({
      reapplyFreeLocationCap,
    } as unknown as BillingEntitlementsService);

    startup.onApplicationBootstrap();
    await Promise.resolve();

    expect(reapplyFreeLocationCap).toHaveBeenCalledTimes(1);
  });

  it('never lets a failing sweep break startup', async () => {
    const startup = new FreePlanCapStartup({
      reapplyFreeLocationCap: jest.fn().mockRejectedValue(new Error('db down')),
    } as unknown as BillingEntitlementsService);

    expect(() => {
      startup.onApplicationBootstrap();
    }).not.toThrow();
    // Lets the rejection settle; an unhandled one would fail the test run.
    await new Promise(resolve => setImmediate(resolve));
  });
});
