import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('RedisThrottlerStorage', () => {
  const build = (evalResult: unknown) => {
    const redis = {
      eval: jest.fn(() => {
        if (evalResult instanceof Error) return Promise.reject(evalResult);
        return Promise.resolve(evalResult);
      }),
    };
    return { redis, storage: new RedisThrottlerStorage(redis as never) };
  };

  it('maps the script result to a storage record in seconds', async () => {
    const { storage } = build([5, 42_100, 0, 0]);

    await expect(storage.increment('1.2.3.4', 60_000, 30, 60_000, 'short')).resolves.toEqual({
      totalHits: 5,
      timeToExpire: 43,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it('reports a blocked caller with the time left on the block', async () => {
    const { storage } = build([31, 20_000, 1, 59_500]);

    await expect(storage.increment('1.2.3.4', 60_000, 30, 60_000, 'short')).resolves.toEqual({
      totalHits: 31,
      timeToExpire: 20,
      isBlocked: true,
      timeToBlockExpire: 60,
    });
  });

  it('keeps each throttler tier and caller in its own key, and the block marker apart from the counter', async () => {
    const { redis, storage } = build([1, 60_000, 0, 0]);

    await storage.increment('abc', 60_000, 30, 60_000, 'medium');

    const [, numKeys, hitsKey, blockKey, ttl, limit, blockFor] = redis.eval.mock
      .calls[0] as unknown as unknown[];
    expect(numKeys).toBe(2);
    expect(hitsKey).toBe('throttler:medium:abc');
    expect(blockKey).toBe('throttler:medium:abc:blocked');
    expect([ttl, limit, blockFor]).toEqual([60_000, 30, 60_000]);
  });

  // Regression guard for the failure mode: a Redis outage must not become an API outage.
  it('allows the request when Redis fails', async () => {
    const { storage } = build(new Error('ECONNREFUSED'));

    await expect(storage.increment('1.2.3.4', 60_000, 30, 60_000, 'short')).resolves.toEqual({
      totalHits: 0,
      timeToExpire: 0,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  // Regression: a dead Redis connection leaves ioredis waiting forever, so "fail open" never happened and every request hung.
  it('allows the request when Redis never answers, within its own time limit', async () => {
    const redis = { eval: jest.fn(() => new Promise(() => undefined)) };
    const storage = new RedisThrottlerStorage(redis as never, 20);

    const started = Date.now();
    const record = await storage.increment('1.2.3.4', 60_000, 30, 60_000, 'short');

    expect(record).toEqual({
      totalHits: 0,
      timeToExpire: 0,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
