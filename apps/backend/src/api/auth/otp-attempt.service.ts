import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { Redis } from 'ioredis';

import { OTP_ATTEMPT_WINDOW_SECONDS, OTP_MAX_ATTEMPTS } from './constants/auth.constants';

/**
 * Per-account attempt ceiling for the verify-email OTP, on top of the per-IP ThrottlerGuard.
 * The throttler alone is not enough: it keys on client IP, so an attacker spreading guesses
 * across many IPs faces no limit at all against a single account, and a 6-digit code that mints
 * a full session on success is well within reach that way.
 *
 * Keyed on the *submitted* email rather than a resolved user id, deliberately — an unknown email
 * is counted exactly like a known one, so this can never become an account-existence oracle.
 * Redis-backed (not a DB column) so a failed guess costs no write to `password_reset_tokens` and
 * the counter expires on its own.
 */
@Injectable()
export class OtpAttemptService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(email: string): string {
    return `auth:otp-attempts:${email}`;
  }

  /**
   * Records one attempt. Returns false once the budget for this window is spent — the caller
   * rejects without ever comparing the code, so a locked-out account is not brute-forceable at
   * all until the window rolls over.
   *
   * Fixed window, not sliding: the TTL is set only when the counter is created, so a persistent
   * attacker cannot hold a victim's account locked indefinitely by continuing to guess. The
   * follow-up `ttl < 0` check is defensive — it repairs a counter that somehow exists without an
   * expiry (a crash between INCR and EXPIRE) instead of leaving it stuck forever.
   */
  async consumeAttempt(email: string): Promise<boolean> {
    const key = this.key(email);
    const attempts = await this.redis.incr(key);

    if (attempts === 1 || (await this.redis.ttl(key)) < 0) {
      await this.redis.expire(key, OTP_ATTEMPT_WINDOW_SECONDS);
    }

    return attempts <= OTP_MAX_ATTEMPTS;
  }

  /** Clears the budget after a correct code, so a later legitimate re-verification starts fresh. */
  async reset(email: string): Promise<void> {
    await this.redis.del(this.key(email));
  }
}
