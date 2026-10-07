import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { Redis } from 'ioredis';

import { createHash } from 'crypto';

import {
  OTP_ATTEMPT_WINDOW_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
} from '../constants/auth.constants';

/**
 * Per-account ceiling on top of the per-IP throttle, which is bypassed by spreading guesses across
 * IPs; a 6-digit code that mints a session is within reach that way. Keyed on the submitted email
 * so unknown emails count like known ones (no existence oracle). Redis-backed so a failed guess
 * costs no DB write and expires on its own.
 */
@Injectable()
export class OtpAttemptService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * SHA-256 of the address, as in `LoginAttemptService`, so Redis read access never reveals
   * registered emails.
   */
  private hashedKey(prefix: string, email: string): string {
    return `${prefix}:${createHash('sha256').update(email).digest('hex')}`;
  }

  private key(email: string): string {
    return this.hashedKey('auth:otp-attempts', email);
  }

  /**
   * Returns false once the budget is spent; the caller then rejects without comparing the code.
   * Fixed window, not sliding: the TTL is set only on creation so a persistent attacker cannot keep
   * a victim locked out; `ttl < 0` repairs a counter left without an expiry (crash between INCR and
   * EXPIRE).
   */
  async consumeAttempt(email: string): Promise<boolean> {
    const key = this.key(email);
    const attempts = await this.redis.incr(key);

    if (attempts === 1 || (await this.redis.ttl(key)) < 0) {
      await this.redis.expire(key, OTP_ATTEMPT_WINDOW_SECONDS);
    }

    return attempts <= OTP_MAX_ATTEMPTS;
  }

  async reset(email: string): Promise<void> {
    await this.redis.del(this.key(email));
  }

  private cooldownKey(email: string): string {
    return this.hashedKey('auth:otp-resend', email);
  }

  /**
   * Load-bearing beyond spam control: issuing a code replaces the live one (`putVerifyEmailToken`
   * upserts), so an uncapped resend lets anyone overwrite a victim's pending code. `SET NX` makes
   * the claim atomic; keyed on the submitted address so it reveals nothing about which accounts
   * exist.
   */
  async claimResend(email: string): Promise<boolean> {
    const claimed = await this.redis.set(
      this.cooldownKey(email),
      '1',
      'EX',
      OTP_RESEND_COOLDOWN_SECONDS,
      'NX'
    );

    return claimed === 'OK';
  }
}
