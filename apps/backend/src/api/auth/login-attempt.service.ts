import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { Redis } from 'ioredis';

import { createHash } from 'crypto';

import { LOGIN_LOCKOUT_THRESHOLD, LOGIN_LOCKOUT_WINDOW_SECONDS } from './constants/auth.constants';

/**
 * Per-account password-login ceiling, the counterpart to `OtpAttemptService` for the login route.
 *
 * The per-route ThrottlerGuard keys on client IP, which is the wrong axis for the attack it was
 * described as blunting: credential stuffing arrives from many addresses, a few attempts each, all
 * aimed at one account, and never trips a per-IP limit. This counts failures per normalized email
 * instead.
 *
 * The key is a SHA-256 of the address rather than the address itself, so anyone with Redis read
 * access sees no list of registered emails. Keyed on the *submitted* address, so an unknown email
 * is counted exactly like a known one and this can never become an existence oracle.
 *
 * Redis-backed and never `users.status`: a lockout can only slow an attacker for one window, and
 * cannot be weaponized to disable someone's account.
 */
@Injectable()
export class LoginAttemptService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(email: string): string {
    return `auth:login-fail:${createHash('sha256').update(email).digest('hex')}`;
  }

  /** Whether this address has already spent its budget for the current window. */
  async isLockedOut(email: string): Promise<boolean> {
    const attempts = await this.redis.get(this.key(email));
    return attempts !== null && Number(attempts) >= LOGIN_LOCKOUT_THRESHOLD;
  }

  /**
   * Records one failed attempt.
   *
   * Fixed window, not sliding: the TTL is set only when the counter is created, so a persistent
   * attacker cannot hold a victim's account locked indefinitely by continuing to guess. The
   * `ttl < 0` branch repairs a counter that somehow exists without an expiry (a crash between
   * INCR and EXPIRE) rather than leaving it stuck forever.
   */
  async recordFailure(email: string): Promise<void> {
    const key = this.key(email);
    const attempts = await this.redis.incr(key);

    if (attempts === 1 || (await this.redis.ttl(key)) < 0) {
      await this.redis.expire(key, LOGIN_LOCKOUT_WINDOW_SECONDS);
    }
  }

  /** Clears the budget after a correct password, so one bad patch of guesses never compounds. */
  async reset(email: string): Promise<void> {
    await this.redis.del(this.key(email));
  }
}
