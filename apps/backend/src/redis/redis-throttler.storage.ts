import { withTimeout } from '@common/helpers/with-timeout';
import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type { Redis } from 'ioredis';

/**
 * One atomic step per request, so concurrent replicas can't both read "29 hits" and both allow the 30th.
 * KEYS[1] counts hits in a fixed window, KEYS[2] is the block marker; ARGV is ttl, limit and block duration in ms.
 * Returns { hits, windowMsLeft, blocked (0|1), blockMsLeft }.
 */
const INCREMENT_SCRIPT = `
local blockLeft = redis.call('PTTL', KEYS[2])
if blockLeft > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  local windowLeft = redis.call('PTTL', KEYS[1])
  if windowLeft < 0 then windowLeft = 0 end
  return { hits, windowLeft, 1, blockLeft }
end
local hits = redis.call('INCR', KEYS[1])
local windowLeft = redis.call('PTTL', KEYS[1])
if windowLeft < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  windowLeft = tonumber(ARGV[1])
end
if hits > tonumber(ARGV[2]) then
  local blockFor = tonumber(ARGV[3])
  redis.call('SET', KEYS[2], '1', 'PX', blockFor)
  return { hits, windowLeft, 1, blockFor }
end
return { hits, windowLeft, 0, 0 }
`;

const KEY_PREFIX = 'throttler';

/** The limiter sits in front of every request, so it may add at most this much latency before it gives up and allows the request. */
export const THROTTLER_STORE_TIMEOUT_MS = 500;

/**
 * Rate-limit counters in Redis instead of process memory: with more than one API replica an in-memory store gives each
 * replica its own allowance (so a brute-force budget is multiplied by the replica count) and forgets everything on restart.
 *
 * Fails open: if Redis is unreachable the request is allowed and the fault is logged, because refusing every request over a
 * rate-limit store outage would turn a Redis blip into a full API outage. Account-level lockouts (`OtpAttemptService`,
 * login lockout) have their own checks.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(
    private readonly redis: Redis,
    private readonly timeoutMs: number = THROTTLER_STORE_TIMEOUT_MS
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `${KEY_PREFIX}:${throttlerName}:${key}`;
    const blockKey = `${hitsKey}:blocked`;
    // `blockDuration` defaults to the window in @nestjs/throttler; guard against 0 so a block never lasts zero ms.
    const blockFor = Math.max(blockDuration, ttl, 1);

    try {
      const [hits, windowMsLeft, blocked, blockMsLeft] = (await withTimeout(
        this.redis.eval(INCREMENT_SCRIPT, 2, hitsKey, blockKey, ttl, limit, blockFor),
        this.timeoutMs,
        'Rate-limit store'
      )) as [number, number, number, number];

      return {
        totalHits: hits,
        timeToExpire: Math.ceil(windowMsLeft / 1000),
        isBlocked: blocked === 1,
        timeToBlockExpire: Math.ceil(blockMsLeft / 1000),
      };
    } catch (error) {
      this.logger.error(
        `Rate-limit store unavailable, allowing the request: ${error instanceof Error ? error.message : String(error)}`
      );
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
