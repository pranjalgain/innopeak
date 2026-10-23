import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { Redis } from 'ioredis';

import { createHash } from 'crypto';

import {
  OTP_ATTEMPT_WINDOW_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
} from '../constants/auth.constants';
import { OtpScope } from '../enums/otp-scope.enum';

/** Which flow, and whose: an email for the public flow, the signed-in principal's id for the rest. */
export interface OtpBudgetKey {
  scope: OtpScope;
  identity: string;
}

/**
 * Per-account ceiling on top of the per-IP throttle, which is bypassed by spreading guesses across
 * IPs; a 6-digit code that mints a session is within reach that way. Redis-backed so a failed guess
 * costs no DB write and expires on its own.
 *
 * Each budget is scoped to a flow (`OtpScope`) and an identity: the public sign-up code is keyed on
 * the submitted email, so unknown emails count like known ones (no existence oracle), while the
 * signed-in flows are keyed on the principal's id, so nobody can spend them from outside.
 */
@Injectable()
export class OtpAttemptService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * SHA-256 of the address, as in `LoginAttemptService`, so Redis read access never reveals
   * registered emails.
   */
  private hashedKey(prefix: string, { scope, identity }: OtpBudgetKey): string {
    return `${prefix}:${scope}:${createHash('sha256').update(identity).digest('hex')}`;
  }

  private key(budget: OtpBudgetKey): string {
    return this.hashedKey('auth:otp-attempts', budget);
  }

  /**
   * Returns false once the budget is spent; the caller then rejects without comparing the code.
   * Fixed window, not sliding: the TTL is set only on creation so a persistent attacker cannot keep
   * a victim locked out; `ttl < 0` repairs a counter left without an expiry (crash between INCR and
   * EXPIRE).
   */
  async consumeAttempt(budget: OtpBudgetKey): Promise<boolean> {
    const key = this.key(budget);
    const attempts = await this.redis.incr(key);

    if (attempts === 1 || (await this.redis.ttl(key)) < 0) {
      await this.redis.expire(key, OTP_ATTEMPT_WINDOW_SECONDS);
    }

    return attempts <= OTP_MAX_ATTEMPTS;
  }

  async reset(budget: OtpBudgetKey): Promise<void> {
    await this.redis.del(this.key(budget));
  }

  private cooldownKey(budget: OtpBudgetKey): string {
    return this.hashedKey('auth:otp-resend', budget);
  }

  /**
   * Gives back a cooldown claimed for a code that was never sent (the email queue refused it), so the person's next click is not
   * answered with "wait a minute" for a mail that does not exist.
   */
  async releaseResend(budget: OtpBudgetKey): Promise<void> {
    await this.redis.del(this.cooldownKey(budget));
  }

  /**
   * Load-bearing beyond spam control: issuing a code replaces the live one (`putVerifyEmailToken`
   * upserts), so an uncapped resend lets anyone overwrite a victim's pending code. `SET NX` makes
   * the claim atomic; keyed on the submitted address so it reveals nothing about which accounts
   * exist.
   */
  async claimResend(budget: OtpBudgetKey): Promise<boolean> {
    const claimed = await this.redis.set(
      this.cooldownKey(budget),
      '1',
      'EX',
      OTP_RESEND_COOLDOWN_SECONDS,
      'NX'
    );

    return claimed === 'OK';
  }
}
