import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { Redis } from 'ioredis';

import { createHash } from 'crypto';

import { LOGIN_LOCKOUT_THRESHOLD, LOGIN_LOCKOUT_WINDOW_SECONDS } from '../constants/auth.constants';

/**
 * Which credential space a counter belongs to. The same email can be both a platform admin and,
 * separately, a tenant business owner (see the dual-identity decision in
 * `separate-admin-login-design.md`), and those are two unrelated passwords guarded by two
 * unrelated login routes — so they must not share one budget.
 *
 * Sharing it was actively harmful, not merely untidy: `reset` runs on every successful login, so
 * one successful *tenant* login wiped the counter protecting the *admin* password on the same
 * address. Anyone holding the self-service tenant password could clear the admin lockout after
 * every failed batch and brute-force the admin password at will, leaving only the per-IP throttle.
 */
export enum LoginAttemptScope {
  TENANT = 'tenant',
  ADMIN = 'admin',
}

/**
 * Per-account password-login ceiling, the counterpart to `OtpAttemptService` for the login route.
 *
 * The per-route ThrottlerGuard keys on client IP, which is the wrong axis for the attack it was
 * described as blunting: credential stuffing arrives from many addresses, a few attempts each, all
 * aimed at one account, and never trips a per-IP limit. This counts failures per normalized email
 * instead — per `LoginAttemptScope`, since one address can hold two independent credentials.
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

  private key(email: string, scope: LoginAttemptScope): string {
    return `auth:login-fail:${scope}:${createHash('sha256').update(email).digest('hex')}`;
  }

  /** Whether this address has already spent its budget for the current window, in this scope. */
  async isLockedOut(email: string, scope: LoginAttemptScope): Promise<boolean> {
    const attempts = await this.redis.get(this.key(email, scope));
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
  async recordFailure(email: string, scope: LoginAttemptScope): Promise<void> {
    const key = this.key(email, scope);
    const attempts = await this.redis.incr(key);

    if (attempts === 1 || (await this.redis.ttl(key)) < 0) {
      await this.redis.expire(key, LOGIN_LOCKOUT_WINDOW_SECONDS);
    }
  }

  /**
   * Clears the budget after a correct password, so one bad patch of guesses never compounds.
   * Scoped, so proving one of an address's two credentials never clears the other's budget.
   */
  async reset(email: string, scope: LoginAttemptScope): Promise<void> {
    await this.redis.del(this.key(email, scope));
  }
}
