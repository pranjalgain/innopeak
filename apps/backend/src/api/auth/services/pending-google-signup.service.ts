import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '@redis/redis.provider';
import type Redis from 'ioredis';

import { randomBytes } from 'crypto';

import {
  GOOGLE_PENDING_SIGNUP_KEY_PREFIX,
  GOOGLE_PENDING_SIGNUP_TTL_SECONDS,
} from '../constants/google-auth.constants';
import type {
  ConsumePendingGoogleSignupResult,
  PendingGoogleSignupIdentity,
} from '../types/auth.type';

/**
 * Collects the business name Google cannot supply (`tenants.name` is NOT NULL) before the tenant is
 * created. Single-use (`GETDEL`) Redis record. Unlike `GoogleOAuthStateService` there is no
 * browser-binding cookie: this nonce only travels in an httpOnly cookie this server set, so it
 * cannot be mailed to a victim the way a `state` URL can. High-entropy, single-use, short-TTL: the
 * same model as the `refresh_token` cookie.
 */
@Injectable()
export class PendingGoogleSignupService {
  private readonly logger = new Logger(PendingGoogleSignupService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** The caller sets the nonce as the `google_pending_signup` cookie. */
  async mint(identity: PendingGoogleSignupIdentity): Promise<string> {
    const nonce = randomBytes(32).toString('base64url');

    // `NX` so a nonce collision fails rather than overwriting another in-flight signup; checked
    // rather than assumed (see `GoogleOAuthStateService.mint`). Not expected to fire at 256 bits.
    const claimed = await this.redis.set(
      `${GOOGLE_PENDING_SIGNUP_KEY_PREFIX}${nonce}`,
      JSON.stringify(identity),
      'EX',
      GOOGLE_PENDING_SIGNUP_TTL_SECONDS,
      'NX'
    );

    if (claimed !== 'OK') {
      this.logger.error('Pending Google signup nonce collision on mint');
      throw new Error('Failed to mint pending Google signup record: nonce collision');
    }

    return nonce;
  }

  async consume(nonce: string | undefined): Promise<ConsumePendingGoogleSignupResult> {
    if (nonce === undefined || nonce === '') {
      return { ok: false };
    }

    const raw = await this.redis.getdel(`${GOOGLE_PENDING_SIGNUP_KEY_PREFIX}${nonce}`);
    if (raw === null) {
      return { ok: false };
    }

    return { ok: true, identity: JSON.parse(raw) as PendingGoogleSignupIdentity };
  }
}
