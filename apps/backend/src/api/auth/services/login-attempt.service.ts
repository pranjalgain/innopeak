import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { Redis } from 'ioredis';

import { createHash } from 'crypto';

import { LOGIN_LOCKOUT_THRESHOLD, LOGIN_LOCKOUT_WINDOW_SECONDS } from '../constants/auth.constants';

/**
 * The same email can be both a platform admin and a tenant owner (two unrelated passwords), so they
 * must not share a budget: `reset` on a successful tenant login would clear the counter protecting
 * the admin password, leaving only the per-IP throttle against brute force.
 */
export enum LoginAttemptScope {
  TENANT = 'tenant',
  ADMIN = 'admin',
}

/**
 * Per-account ceiling: the per-IP throttle misses credential stuffing, which spreads a few attempts
 * per account across many addresses. Keyed on a SHA-256 of the *submitted* email, so Redis read
 * access reveals no registered emails and unknown emails count like known ones (no existence
 * oracle). Redis-backed, never `users.status`, so a lockout cannot be weaponized to disable an
 * account.
 */
@Injectable()
export class LoginAttemptService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(email: string, scope: LoginAttemptScope): string {
    return `auth:login-fail:${scope}:${createHash('sha256').update(email).digest('hex')}`;
  }

  async isLockedOut(email: string, scope: LoginAttemptScope): Promise<boolean> {
    const attempts = await this.redis.get(this.key(email, scope));
    return attempts !== null && Number(attempts) >= LOGIN_LOCKOUT_THRESHOLD;
  }

  /**
   * Fixed window, not sliding: the TTL is set only on creation so a persistent attacker cannot keep
   * a victim locked out. `ttl < 0` repairs a counter left without an expiry (crash between INCR and
   * EXPIRE).
   */
  async recordFailure(email: string, scope: LoginAttemptScope): Promise<void> {
    const key = this.key(email, scope);
    const attempts = await this.redis.incr(key);

    if (attempts === 1 || (await this.redis.ttl(key)) < 0) {
      await this.redis.expire(key, LOGIN_LOCKOUT_WINDOW_SECONDS);
    }
  }

  /** Scoped, so proving one credential never clears the other's budget. */
  async reset(email: string, scope: LoginAttemptScope): Promise<void> {
    await this.redis.del(this.key(email, scope));
  }
}
