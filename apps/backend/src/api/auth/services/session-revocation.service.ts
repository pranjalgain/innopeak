import { withTimeout } from '@common/helpers/with-timeout';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { Redis } from 'ioredis';

import { ACCESS_TOKEN_TTL_SECONDS } from '../constants/auth.constants';

/** Outlives every access token that could still be in the wild, then disappears on its own. */
const REVOCATION_TTL_SECONDS = ACCESS_TOKEN_TTL_SECONDS + 60;

/**
 * The shared Redis client waits indefinitely for a dead connection (BullMQ needs that), so without a bound a Redis outage would hold
 * every authenticated request here until it came back, and "fails open" would only hold when Redis answered with an error.
 */
const REDIS_TIMEOUT_MS = 500;

const userKey = (userId: string): string => `auth:sessions-revoked-after:user:${userId}`;
const tenantKey = (tenantId: string): string => `auth:sessions-revoked-after:tenant:${tenantId}`;

/**
 * A JWT cannot be taken back, so a logout, a password change, a disabled user or a suspended business used to leave every access token
 * already issued working until it expired (up to 15 minutes). This is the missing "not before" mark: when something should end a
 * user's (or a whole business's) sessions, the moment is written to Redis, and `JwtStrategy` refuses any access token issued before
 * it. One MGET per tenant request; the keys expire after the longest an access token can live, so nothing accumulates.
 *
 * A token's `iat` has one-second resolution, so a mark is a second too: a token is refused when it was issued *before* the mark's second.
 * `revokeUser` marks the second *after* the current one, so it also ends tokens issued in the very second of the event; the one exception
 * is a password change, which mints the caller's fresh tokens straight afterwards and so must leave the current second alone.
 *
 * Revoking is best-effort and `isRevoked` fails open: Redis is already a hard dependency (rate limiting, OAuth state), the refresh
 * path still enforces the same standing within one access-token lifetime, and an outage here must not turn into every request failing.
 */
@Injectable()
export class SessionRevocationService {
  private readonly logger = new Logger(SessionRevocationService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Ends every access token this user holds. `exceptCurrentSecond` is for the one caller that issues the user a fresh token right after
   * (a password change): tokens issued in the second of the change survive, and everything older does not.
   */
  async revokeUser(userId: string, options: { exceptCurrentSecond?: boolean } = {}): Promise<void> {
    await this.mark(userKey(userId), options.exceptCurrentSecond === true ? 0 : 1);
  }

  /** Ends every access token of every user of the business (suspended, erasure requested). */
  async revokeTenant(tenantId: string): Promise<void> {
    await this.mark(tenantKey(tenantId), 1);
  }

  async isRevoked(input: {
    userId: string;
    /** Omitted for a platform admin, who belongs to no business: only the user mark applies. */
    tenantId?: string;
    /** The token's `iat` (epoch seconds). A token without one cannot be placed in time, so any mark refuses it. */
    issuedAt: number | undefined;
  }): Promise<boolean> {
    let marks: Array<string | null>;
    try {
      marks = await withTimeout(
        this.redis.mget(
          ...(input.tenantId === undefined
            ? [userKey(input.userId)]
            : [userKey(input.userId), tenantKey(input.tenantId)])
        ),
        REDIS_TIMEOUT_MS,
        'session revocation read'
      );
    } catch (error) {
      this.logger.warn(
        `Could not read the session revocation marks (failing open): ${(error as Error).message}`
      );
      return false;
    }

    return marks.some(mark => {
      if (mark === null) {
        return false;
      }
      return input.issuedAt === undefined || input.issuedAt < Number(mark);
    });
  }

  private async mark(key: string, secondsAhead: number): Promise<void> {
    const markedAt = Math.floor(Date.now() / 1000) + secondsAhead;
    try {
      await withTimeout(
        this.redis.set(key, String(markedAt), 'EX', REVOCATION_TTL_SECONDS),
        REDIS_TIMEOUT_MS,
        'session revocation write'
      );
    } catch (error) {
      // The caller's own action already took effect and the refresh path enforces it within one access-token lifetime.
      this.logger.error(
        `Could not record a session revocation (${key}): ${(error as Error).message}`
      );
    }
  }
}
