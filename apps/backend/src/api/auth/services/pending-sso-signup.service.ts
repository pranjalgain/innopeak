import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '@redis/redis.provider';
import type Redis from 'ioredis';

import { randomBytes } from 'crypto';

import {
  LEGACY_GOOGLE_PENDING_SIGNUP_KEY_PREFIX,
  SSO_PENDING_SIGNUP_KEY_PREFIX,
  SSO_PENDING_SIGNUP_TTL_SECONDS,
  SsoProvider,
} from '../constants/sso-auth.constants';
import type { ConsumePendingSsoSignupResult, PendingSsoSignupIdentity } from '../types/auth.type';

/**
 * Collects the business name an SSO provider cannot supply (`tenants.name` is NOT NULL) before the tenant is
 * created. Single-use (`GETDEL`) Redis record. Unlike `OAuthStateService` there is no
 * browser-binding cookie: this nonce only travels in an httpOnly cookie this server set, so it
 * cannot be mailed to a victim the way a `state` URL can. High-entropy, single-use, short-TTL: the
 * same model as the `refresh_token` cookie.
 */
@Injectable()
export class PendingSsoSignupService {
  private readonly logger = new Logger(PendingSsoSignupService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** The caller sets the nonce as the `sso_pending_signup` cookie. */
  async mint(identity: PendingSsoSignupIdentity): Promise<string> {
    const nonce = randomBytes(32).toString('base64url');

    // `NX` so a nonce collision fails rather than overwriting another in-flight signup; checked
    // rather than assumed (see `OAuthStateService.mint`). Not expected to fire at 256 bits.
    const claimed = await this.redis.set(
      `${SSO_PENDING_SIGNUP_KEY_PREFIX}${nonce}`,
      JSON.stringify(identity),
      'EX',
      SSO_PENDING_SIGNUP_TTL_SECONDS,
      'NX'
    );

    if (claimed !== 'OK') {
      this.logger.error('Pending SSO signup nonce collision on mint');
      throw new Error('Failed to mint pending SSO signup record: nonce collision');
    }

    return nonce;
  }

  async consume(nonce: string | undefined): Promise<ConsumePendingSsoSignupResult> {
    if (nonce === undefined || nonce === '') {
      return { ok: false };
    }

    const raw = await this.redis.getdel(`${SSO_PENDING_SIGNUP_KEY_PREFIX}${nonce}`);
    if (raw !== null) {
      return { ok: true, identity: JSON.parse(raw) as PendingSsoSignupIdentity };
    }

    // TRANSITIONAL (see `LEGACY_GOOGLE_PENDING_SIGNUP_KEY_PREFIX`): a record minted before the rename, which was always
    // Google's and carried no provider.
    const legacy = await this.redis.getdel(`${LEGACY_GOOGLE_PENDING_SIGNUP_KEY_PREFIX}${nonce}`);
    if (legacy === null) {
      return { ok: false };
    }
    const identity = JSON.parse(legacy) as Omit<PendingSsoSignupIdentity, 'provider'>;
    return { ok: true, identity: { ...identity, provider: SsoProvider.GOOGLE } };
  }
}
