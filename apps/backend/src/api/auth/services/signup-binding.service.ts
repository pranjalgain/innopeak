import { EnvConfig } from '@config/env.config';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { createHmac, timingSafeEqual } from 'crypto';

/** Domain-separates the signup-binding key from every other use of the secret it is derived from. */
const SIGNUP_BINDING_KEY_LABEL = 'innopeak:signup-binding-key:v1';

/**
 * The browser-side half of finishing a password sign-up (see `SIGNUP_BINDING_COOKIE_NAME`). Stateless: the value is an HMAC over the
 * user id and the password hash that sign-up stored, so there is nothing to look up, and it stops matching the moment the password
 * hash changes (a Google or Microsoft sign-in adopting the account clears it) or the row is replaced.
 */
@Injectable()
export class SignupBindingService {
  private readonly key: Buffer;

  constructor(configService: ConfigService<EnvConfig>) {
    const secret = configService.get<string>('JWT_SECRET');
    if (secret === undefined || secret === '') {
      throw new Error('Signup binding needs JWT_SECRET to derive its key from.');
    }
    this.key = createHmac('sha256', secret).update(SIGNUP_BINDING_KEY_LABEL).digest();
  }

  /** What to put in the cookie for a user whose sign-up password is `passwordHash`. */
  issue(user: { id: string; passwordHash: string }): string {
    return this.compute(user);
  }

  /** False for a missing, malformed or foreign value, and for a user with no password (nothing to prove knowledge of). */
  matches(
    user: { id: string; passwordHash: string | null },
    presented: string | undefined
  ): boolean {
    if (presented === undefined || presented === '' || user.passwordHash === null) {
      return false;
    }

    const expected = Buffer.from(this.compute({ id: user.id, passwordHash: user.passwordHash }));
    const actual = Buffer.from(presented);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private compute(user: { id: string; passwordHash: string }): string {
    return createHmac('sha256', this.key)
      .update(`${user.id}|${user.passwordHash}`)
      .digest('base64url');
  }
}
